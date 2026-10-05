/**
 * Bibliothèque Email : l'inventaire des lames pour la page d'exploration. Tout
 * en est dérivé des sources du domaine, sans seconde liste de lames :
 * le manifeste (lames, familles, slots, surfaces), le catalogue métier (noms et
 * rôles), le Draft et son resolver (statut IA), les fixtures de bibliothèque
 * (aperçus, voir `library-fixtures.ts`).
 *
 * Statut IA — « IA V1 » : la lame peut être produite par le moteur Claude Email
 * V1, c'est-à-dire qu'elle est atteignable par `EmailGenerationDraft` + le
 * resolver, avec une requête que le moteur accepte. Le statut n'est pas une
 * liste écrite à la main : il est mesuré en résolvant des brouillons de sonde
 * (un par photo de hero et par type de bloc de corps), avec et sans fait à
 * mention légale. Cela couvre les lames que Claude choisit (héros selon
 * l'image, blocs de corps) et celles que le resolver pose lui-même (header,
 * footer, mentions légales). « Bibliothèque uniquement » : la lame existe et
 * fonctionne, sans être exposée au générateur V1 (une future version pourra
 * l'ouvrir).
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { resolveEmailDraftToConfig } from "./draft-resolver"
import { emailDraftBodyLames, emailDraftHeroBlocks, emailDraftImageIds, type EmailGenerationDraft } from "./generation-draft"
import type { EmailGenerationRequest } from "./generation-request"
import { emailImageBlocks, emailImagesForBlock } from "./image-catalog"
import { emailBlockFamilies, emailBlockManifest, type EmailBlockFamily, type EmailSlotKind, type EmailSurfaceMode } from "./manifest"
import { emailSectionCatalog } from "./section-catalog"
import type { EmailBlockType } from "./types"

/* -------------------------------------------------------------------------- */
/* Statut IA V1                                                               */
/* -------------------------------------------------------------------------- */

const probeRequest: EmailGenerationRequest = {
  campaignName: "Sonde de la bibliothèque",
  brief: "Sonde déterministe du vocabulaire du Draft.",
  audience: "Sonde",
  objective: "decouverte-formations",
}

/** Même requête avec un fait à mention légale : le resolver ajoute alors les mentions. */
const probeRequestWithDisclaimer: EmailGenerationRequest = {
  ...probeRequest,
  facts: [{ statement: "Fait de démonstration.", disclaimer: "financement-personnel" }],
}

const t = "Sonde"
const item = { title: t, text: t }
const cta = { label: t, destination: "catalogue-formations" } as const
const heroImage = emailDraftImageIds[0]!

const probeBodies = [
  { type: "steps", eyebrow: t, items: [item, item, item] },
  { type: "grid", eyebrow: t, title: t, items: [item, item, item, item] },
  { type: "icons", title: t, items: [{ icon: "users", ...item }, { icon: "users", ...item }, { icon: "users", ...item }] },
  { type: "text", title: t, text: t },
  { type: "feature", title: t, text: t, cardTitle: t, cardText: t, cta },
  { type: "cta", title: t, text: t, cta },
] as const

/** Brouillons de sonde : chaque photo de hero avec un corps, et chaque type de corps avec un hero. */
function probeDrafts(): unknown[] {
  const draft = (image: string, body: unknown): EmailGenerationDraft =>
    ({ subject: t, preheader: t, blocks: [{ type: "hero", image, eyebrow: t, title: t, text: t, cta }, body] }) as EmailGenerationDraft
  return [...emailDraftImageIds.map((image) => draft(image, probeBodies[0])), ...probeBodies.map((body) => draft(heroImage, body))]
}

/** Lames atteignables par le Draft V1 et son resolver. */
function reachableTypes(): ReadonlySet<EmailBlockType> {
  const reached = new Set<EmailBlockType>()
  for (const request of [probeRequest, probeRequestWithDisclaimer]) {
    for (const draft of probeDrafts()) {
      const result = resolveEmailDraftToConfig(request, draft)
      if (result.status !== "resolved") throw new Error(`Brouillon de sonde non résolu : ${JSON.stringify(result)}`)
      for (const block of result.config.blocks) reached.add(block.type)
    }
  }
  return reached
}

/* -------------------------------------------------------------------------- */
/* Inventaire                                                                 */
/* -------------------------------------------------------------------------- */

export type EmailLibraryStatus = "ai-v1" | "library-only"

/** Comment la lame entre dans un email généré par la V1. */
export type EmailLibraryAiRole = "hero" | "body" | "shell"

export type EmailLibrarySlotSummary = {
  total: number
  /** Nombre de slots par nature, dans l'ordre du manifeste (natures absentes omises). */
  byKind: Partial<Record<EmailSlotKind, number>>
  optional: number
}

/** Visuels : la photo du catalogue si un asset a le bon cadre, un emplacement vide sinon. */
export type EmailLibraryVisuals = "none" | "photo" | "empty"

export type EmailLibraryEntry = {
  /** Identifiant technique (clé du manifeste), aussi utilisé comme route d'aperçu. */
  type: EmailBlockType
  /** Nom humain (catalogue métier). */
  name: string
  /** Rôle de la lame (catalogue métier). */
  role: string
  family: EmailBlockFamily
  surfaceMode: EmailSurfaceMode
  slots: EmailLibrarySlotSummary
  visuals: EmailLibraryVisuals
  status: EmailLibraryStatus
  /** Défini pour une lame « IA V1 ». */
  aiRole?: EmailLibraryAiRole
}

type ManifestEntry = { family: EmailBlockFamily; surfaceMode: EmailSurfaceMode; slots: Readonly<Record<string, EmailSlotKind>>; optional?: readonly string[] }

function summarizeSlots(entry: ManifestEntry): EmailLibrarySlotSummary {
  const byKind: Partial<Record<EmailSlotKind, number>> = {}
  for (const kind of Object.values(entry.slots)) byKind[kind] = (byKind[kind] ?? 0) + 1
  return { total: Object.keys(entry.slots).length, byKind, optional: entry.optional?.length ?? 0 }
}

function visualsOf(type: EmailBlockType, entry: ManifestEntry): EmailLibraryVisuals {
  if (!Object.values(entry.slots).includes("asset:visuel")) return "none"
  return emailImagesForBlock(type).length > 0 ? "photo" : "empty"
}

function buildEntries(): EmailLibraryEntry[] {
  const reached = reachableTypes()
  const authored = new Set<string>([...emailDraftHeroBlocks, ...emailDraftBodyLames])
  // Les héros que Claude choisit : ceux des photos du Draft.
  const heroes = new Set<string>(emailDraftImageIds.flatMap((id) => emailImageBlocks(id)))
  return (Object.keys(emailBlockManifest) as EmailBlockType[]).map((type) => {
    const entry = emailBlockManifest[type] as ManifestEntry
    const catalog = emailSectionCatalog[type]
    const status: EmailLibraryStatus = reached.has(type) ? "ai-v1" : "library-only"
    const aiRole: EmailLibraryAiRole | undefined =
      status === "library-only" ? undefined : heroes.has(type) ? "hero" : authored.has(type) ? "body" : "shell"
    return {
      type,
      name: catalog.name,
      role: catalog.role,
      family: entry.family,
      surfaceMode: entry.surfaceMode,
      slots: summarizeSlots(entry),
      visuals: visualsOf(type, entry),
      status,
      ...(aiRole ? { aiRole } : {}),
    }
  })
}

/** Les lames du manifeste, regroupées par familles dans l'ordre de `emailBlockFamilies`. */
export const emailLibraryEntries: readonly EmailLibraryEntry[] = (() => {
  const entries = buildEntries()
  return emailBlockFamilies.flatMap((family) => entries.filter((entry) => entry.family === family))
})()

export const emailLibraryFamilies: readonly EmailBlockFamily[] = emailBlockFamilies.filter((family) =>
  emailLibraryEntries.some((entry) => entry.family === family)
)

export function getEmailLibraryEntry(type: string): EmailLibraryEntry | undefined {
  return emailLibraryEntries.find((entry) => entry.type === type)
}
