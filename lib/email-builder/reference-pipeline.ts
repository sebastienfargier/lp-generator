/**
 * Création d'un email depuis une référence : de la réponse validée du premier appel au document.
 *
 *   réponse { status, sensitive, analysis, mapping }
 *     → normalisation (`reference-mapping`)
 *     → BASE OFFICIELLE (V2.8) : plan par le code → moteur de composition V2.7 sur un document vierge
 *     → [V2.9.4] sélection des sections à gap structurel (`reference-gap`) → SI candidats, UN second appel (injecté)
 *       → chaque candidat construit indépendamment (`reference-generated-build`)
 *       → document AMÉLIORÉ : un seul plan (`DomainCompositionPlan`), les lames générées remplaçant les sections concernées
 *     → { document, rapport }
 *
 * L'amélioration est FACULTATIVE : la base officielle est construite avant et indépendamment, jamais mutée, et c'est
 * elle qui est rendue si le second appel échoue (erreur, réponse inexploitable, aucun candidat retenu, plan non
 * assemblable). Le résultat Reference ne dépend donc jamais du second appel. Aucun appel s'il n'y a aucun candidat.
 *
 * Aucun repli sur la base d'une image qui n'est pas un email, ou dont aucune section de corps n'a d'équivalent :
 * elle ne produit RIEN (jamais un en-tête et un footer seuls). Les faits de la référence ne deviennent jamais des
 * faits du document : `facts` reste vide.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { validateCompositionPlan, type CompositionCatalog } from "./composition"
import { referenceCompositionCatalog } from "./reference-catalog"
import { createEmailDocument, type EmailDocument } from "./document"
import { generatedBlockSlots, type GeneratedEmailBlock } from "./generated-block"
import { normalizeReferenceMapping, type NormalizedReference, type NormalizedSection } from "./reference-mapping"
import { selectGeneratedReferenceCandidates, type GeneratedReferenceSelection, type ReferenceGapSection } from "./reference-gap"
import { buildGeneratedReferenceBlocks } from "./reference-generated-build"
import { buildGeneratedReferenceRequest, type GeneratedReferenceRequest } from "./reference-generated-request"
import type { GeneratedReferenceOutput } from "./reference-generated-schema"
import { buildReferencePlan, placedSections, referenceCompositionLimits } from "./reference-plan"
import { buildReferenceReport, referenceProvenance, type ReferenceGenerationOutcome, type ReferenceReport, type ReferenceSectionOutcome } from "./reference-report"
import type { ReferenceResponse } from "./reference-schema"

export type ReferenceCreation =
  | { status: "created"; document: EmailDocument; report: ReferenceReport }
  | { status: "not-an-email" }
  | { status: "no-match"; report: ReferenceReport }
  | { status: "invalid"; message: string }

type Prepared = { status: "ready"; reference: NormalizedReference; neutral: CompositionCatalog } | Exclude<ReferenceCreation, { status: "created" | "no-match" }>

/** La réponse du premier appel, normalisée : ou la raison pour laquelle rien ne sera créé. */
function prepare(response: ReferenceResponse, catalog: CompositionCatalog): Prepared {
  if (response.status === "not-an-email") return { status: "not-an-email" }
  if (response.analysis.sections.length === 0) return { status: "invalid", message: "La réponse ne décrit aucune section." }
  const normalized = normalizeReferenceMapping(response, catalog)
  if (!normalized.ok) return { status: "invalid", message: normalized.message }
  // Les slots contrôlés des lames promotionnelles partent de l'état neutre : jamais une valeur d'exemple ni une valeur de la référence.
  return { status: "ready", reference: normalized.value, neutral: referenceCompositionCatalog(catalog) }
}

const blank = (provenance: ReturnType<typeof referenceProvenance>) =>
  createEmailDocument({ version: 1, id: "nouvel-email", name: "Nouvel email · Référence", subject: "Objet à définir", preheader: "Texte d'aperçu à définir", blocks: [] }, { provenance: { origin: "reference", reference: provenance } })

/** La base OFFICIELLE (V2.8) : le résultat que la création garantit, avec ou sans lames générées. */
function createOfficial(reference: NormalizedReference, neutral: CompositionCatalog, catalog: CompositionCatalog): ReferenceCreation {
  const report = buildReferenceReport(reference, catalog)
  if (placedSections(reference.sections).length === 0) return { status: "no-match", report }
  const checked = validateCompositionPlan(blank(referenceProvenance(reference)), buildReferencePlan(reference.sections, neutral), neutral, { limits: referenceCompositionLimits })
  if (!checked.ok) return { status: "invalid", message: checked.message }
  return { status: "created", document: checked.next, report }
}

/** Création officielle seule : exactement V2.8, sans lame générée (le comportement historique, conservé). */
export function createDocumentFromReference(response: ReferenceResponse, catalog: CompositionCatalog): ReferenceCreation {
  const prepared = prepare(response, catalog)
  return prepared.status === "ready" ? createOfficial(prepared.reference, prepared.neutral, catalog) : prepared
}

/* -------------------------------------------------------------------------- */
/* Lames générées                                                             */
/* -------------------------------------------------------------------------- */

/** L'analyse STRUCTURELLE d'une section, telle que la sélection la lit : jamais son intention libre. */
export const toGapSection = (section: NormalizedSection): ReferenceGapSection => ({
  ref: section.ref,
  status: section.status,
  role: section.analysis.role,
  layout: section.analysis.layout,
  tone: section.analysis.tone,
  hasImage: section.analysis.hasImage,
  imageCount: section.analysis.imageCount,
  hasCta: section.analysis.hasCta,
  repeatedItems: section.analysis.repeatedItems,
  structure: section.structure,
})

export type ReferenceGenerationPlan = { selection: GeneratedReferenceSelection; /** Absente s'il n'y a aucun candidat : alors aucun second appel. */ request?: GeneratedReferenceRequest }

/** Quelles sections tenter, et la requête du second appel (3 candidats au plus). Pur : aucun appel. */
export function planReferenceGeneration(reference: NormalizedReference): ReferenceGenerationPlan {
  const selection = selectGeneratedReferenceCandidates(reference.sections.map(toGapSection))
  return selection.selected.length === 0 ? { selection } : { selection, request: buildGeneratedReferenceRequest(selection.selected, reference.sections.map((section) => section.analysis.role)) }
}

/** Le second appel, tel que le pipeline le voit : une requête, une réponse validée ou un échec. Aucun détail technique n'en sort. */
export type GenerateReferenceBlocks = (request: GeneratedReferenceRequest) => Promise<{ status: "success"; output: GeneratedReferenceOutput } | { status: "error" }>

/** Les sections que la sélection a écartées pour la LIMITE (jamais promues, même si un des trois retenus échoue). */
const skippedByLimit = (plan: ReferenceGenerationPlan) => plan.selection.decisions.filter((entry) => entry.outcome === "not-selected-limit").map((entry) => entry.ref)

const outcomes = (plan: ReferenceGenerationPlan, entries: Iterable<[string, ReferenceSectionOutcome]> = []) => new Map<string, ReferenceSectionOutcome>([...skippedByLimit(plan).map((ref): [string, ReferenceSectionOutcome] => [ref, "limit"]), ...entries])

/**
 * Le résultat complet : la base officielle, puis l'amélioration par lames générées SI elle est possible. Ne lève pas ;
 * `generate` peut lever ou échouer sans que la création en souffre.
 */
export async function createReferenceWithGeneration(response: ReferenceResponse, catalog: CompositionCatalog, generate: GenerateReferenceBlocks): Promise<ReferenceCreation> {
  const prepared = prepare(response, catalog)
  if (prepared.status !== "ready") return prepared
  const { reference, neutral } = prepared

  const base = createOfficial(reference, neutral, catalog)
  if (base.status !== "created" && base.status !== "no-match") return base

  const plan = planReferenceGeneration(reference)
  if (!plan.request) return base

  // La base reste intacte : seul son rapport dit ce qui a été tenté (document identique, jamais reconstruit de mémoire).
  const fallback = (generation: ReferenceGenerationOutcome): ReferenceCreation => ({ ...base, report: buildReferenceReport(reference, catalog, generation) })
  const unavailable = () => fallback({ sections: outcomes(plan), unavailable: true, degraded: false, buttons: false })

  let answer: Awaited<ReturnType<GenerateReferenceBlocks>>
  try {
    answer = await generate(plan.request)
  } catch {
    return unavailable()
  }
  if (answer.status !== "success") return unavailable()

  const built = buildGeneratedReferenceBlocks(plan.request.candidates, answer.output.items)
  const accepted = new Map<string, GeneratedEmailBlock>()
  const compatibility: string[] = []
  for (const result of built.results) {
    if (result.ok) {
      accepted.set(result.ref, result.block)
      compatibility.push(result.compatibility)
    }
  }
  const generation: ReferenceGenerationOutcome = {
    sections: outcomes(plan, built.results.map((result): [string, ReferenceSectionOutcome] => [result.ref, result.ok ? "generated" : "failed"])),
    unavailable: false,
    degraded: compatibility.includes("degraded"),
    buttons: [...accepted.values()].some((block) => generatedBlockSlots(block).some((slot) => slot.kind === "cta" || slot.kind === "cta:fleche")),
  }

  // Aucune lame retenue : le résultat reste celui de la base ; seul le rapport dit ce qui a été tenté.
  if (accepted.size === 0) return fallback(generation)

  const checked = validateCompositionPlan(
    blank(referenceProvenance(reference, generation)),
    buildReferencePlan(reference.sections, neutral, new Map([...accepted].map(([ref, block]) => [ref, { spec: block.spec, slots: block.slots }]))),
    neutral,
    { limits: referenceCompositionLimits },
  )
  // Un plan avec lames générées qui ne s'assemble pas : la base, telle quelle (jamais un document corrompu).
  if (!checked.ok) return unavailable()
  return { status: "created", document: checked.next, report: buildReferenceReport(reference, catalog, generation) }
}
