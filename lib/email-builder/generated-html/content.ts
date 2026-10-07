/**
 * Contenu d'une lame générée et sa validation (V2.9.3 : extrait du compilateur pour que
 * les opérations du Builder, qui tournent aussi dans le navigateur, valident le contenu
 * sans importer le renderer, qui lit des fichiers). Pur : aucun HTML, aucun réseau.
 *
 * Le contenu d'un slot est typé par son genre : un texte, un bouton (libellé + destination
 * Studi contrôlée), une image de la banque, une icône du catalogue. Jamais une URL libre.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { emailDestinations, type EmailDestinationId } from "../../email/destinations"
import { emailBankDerivative, EmailImageBankError, isEmailBankImageId, type EmailBankImageId } from "../../email/image-bank"
import { emailIconNames, type EmailIconName } from "../../email/manifest"
import type { GeneratedSlot } from "../generated/slots"

/** Le contenu d'un slot, typé par son genre : aucune URL libre, aucun HTML. */
export type GeneratedSlotContent =
  | { text: string }
  | { label: string; destination: EmailDestinationId }
  | { imageId: EmailBankImageId }
  | { icon: EmailIconName }

export type GeneratedBlockContent = Record<string, GeneratedSlotContent>


export type GeneratedRenderIssue = { code: "spec" | "surface" | "content" | "slot-missing" | "slot-extra" | "kind" | "text" | "image-unknown" | "image-incompatible" | "destination" | "icon" | "hygiene"; path: string; message: string }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))

/** Vérifie le contenu contre les slots dérivés : exactement les mêmes noms, le bon genre, des valeurs du système. */
export function validateGeneratedContent(slots: readonly GeneratedSlot[], content: unknown): GeneratedRenderIssue[] {
  if (!isRecord(content)) return [{ code: "content", path: "content", message: "Le contenu est un objet { slot: valeur }." }]
  const issues: GeneratedRenderIssue[] = []
  const names = new Set(slots.map((slot) => slot.name))
  for (const name of Object.keys(content)) if (!names.has(name)) issues.push({ code: "slot-extra", path: name, message: `Slot « ${name.slice(0, 40)} » : absent de la spec.` })
  for (const slot of slots) {
    const path = slot.name
    if (!Object.hasOwn(content, slot.name)) {
      issues.push({ code: "slot-missing", path, message: `Slot « ${slot.name} » : contenu manquant.` })
      continue
    }
    const value = content[slot.name]
    const bad = (code: GeneratedRenderIssue["code"], message: string) => issues.push({ code, path, message })
    const text = (candidate: unknown, max: number, label: string) => {
      if (typeof candidate !== "string" || candidate.trim() === "") return bad("text", `Slot « ${slot.name} » : ${label} requis.`)
      if (candidate.length > max) return bad("text", `Slot « ${slot.name} » : ${max} caractères au plus.`)
      if (controlCharacters.test(candidate)) return bad("text", `Slot « ${slot.name} » : caractères de contrôle interdits.`)
    }
    switch (slot.kind) {
      case "texte":
        if (!isRecord(value) || !exactKeys(value, ["text"])) bad("kind", `Slot « ${slot.name} » : { text } attendu.`)
        else text(value.text, slot.maxLength ?? 0, "texte")
        break
      case "cta":
      case "cta:fleche":
        if (!isRecord(value) || !exactKeys(value, ["label", "destination"])) bad("kind", `Slot « ${slot.name} » : { label, destination } attendu.`)
        else {
          text(value.label, slot.maxLength ?? 0, "libellé")
          if (typeof value.destination !== "string" || !Object.hasOwn(emailDestinations, value.destination)) bad("destination", `Slot « ${slot.name} » : destination inconnue du système.`)
        }
        break
      case "asset:visuel":
        if (!isRecord(value) || !exactKeys(value, ["imageId"])) bad("kind", `Slot « ${slot.name} » : { imageId } attendu.`)
        else if (typeof value.imageId !== "string" || !isEmailBankImageId(value.imageId)) bad("image-unknown", `Slot « ${slot.name} » : image inconnue de la banque.`)
        else {
          try {
            emailBankDerivative(value.imageId, slot.format ?? "")
          } catch (error) {
            if (!(error instanceof EmailImageBankError)) throw error
            bad("image-incompatible", `Slot « ${slot.name} » : l'image « ${value.imageId} » n'a pas de dérivé « ${slot.format} ».`)
          }
        }
        break
      case "asset:icone":
        if (!isRecord(value) || !exactKeys(value, ["icon"])) bad("kind", `Slot « ${slot.name} » : { icon } attendu.`)
        else if (typeof value.icon !== "string" || !(emailIconNames as readonly string[]).includes(value.icon)) bad("icon", `Slot « ${slot.name} » : icône hors catalogue.`)
        break
    }
  }
  return issues
}

