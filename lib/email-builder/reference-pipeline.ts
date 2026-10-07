/**
 * Création d'un email depuis une référence : de la réponse validée du modèle au
 * document, SANS réseau ni modèle. Pur et déterministe.
 *
 *   réponse { status, sensitive, analysis, mapping }
 *     → normalisation (`reference-mapping`)
 *     → plan de composition (`reference-plan`, par le code, pas par le modèle)
 *     → document vierge de provenance « référence » + moteur de composition V2.7
 *       (un plan, une application atomique)
 *     → { document, rapport }
 *
 * Aucun repli : une image qui n'est pas un email, ou dont aucune section de corps
 * n'a d'équivalent, ne produit RIEN (jamais un en-tête et un footer seuls). Les
 * faits de la référence ne deviennent jamais des faits du document : `facts` reste
 * vide.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { validateCompositionPlan, type CompositionCatalog } from "./composition"
import { referenceCompositionCatalog } from "./reference-catalog"
import { createEmailDocument, type EmailDocument } from "./document"
import { normalizeReferenceMapping } from "./reference-mapping"
import { buildReferencePlan, placedSections, referenceCompositionLimits } from "./reference-plan"
import { buildReferenceReport, referenceProvenance, type ReferenceReport } from "./reference-report"
import type { ReferenceResponse } from "./reference-schema"

export type ReferenceCreation =
  | { status: "created"; document: EmailDocument; report: ReferenceReport }
  | { status: "not-an-email" }
  | { status: "no-match"; report: ReferenceReport }
  | { status: "invalid"; message: string }

export function createDocumentFromReference(response: ReferenceResponse, catalog: CompositionCatalog): ReferenceCreation {
  if (response.status === "not-an-email") return { status: "not-an-email" }
  if (response.analysis.sections.length === 0) return { status: "invalid", message: "La réponse ne décrit aucune section." }

  const normalized = normalizeReferenceMapping(response, catalog)
  if (!normalized.ok) return { status: "invalid", message: normalized.message }
  const reference = normalized.value
  const report = buildReferenceReport(reference, catalog)
  if (placedSections(reference.sections).length === 0) return { status: "no-match", report }

  const base = createEmailDocument(
    { version: 1, id: "nouvel-email", name: "Nouvel email · Référence", subject: "Objet à définir", preheader: "Texte d'aperçu à définir", blocks: [] },
    { provenance: { origin: "reference", reference: referenceProvenance(reference) } },
  )
  // Les slots contrôlés des lames promotionnelles partent de l'état neutre : jamais une valeur d'exemple ni une valeur de la référence.
  const neutral = referenceCompositionCatalog(catalog)
  const checked = validateCompositionPlan(base, buildReferencePlan(reference.sections, neutral), neutral, { limits: referenceCompositionLimits })
  if (!checked.ok) return { status: "invalid", message: checked.message }
  return { status: "created", document: checked.next, report }
}
