/**
 * Document de démonstration du Builder : un VRAI email Studi du POC (promotion
 * R4, fixture « R4-B »), enveloppé dans un EmailDocument. Déterministe : aucun
 * appel de modèle, aucune horloge. SERVEUR UNIQUEMENT (fixtures du domaine Email).
 *
 * Valeurs de démonstration : le code, le pourcentage et la date de cette
 * fixture ne sont pas une offre Studi.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { emailPromotionFixtures } from "../email/promotion-fixtures"
import { resolvePromotionDraft } from "../email/promotion-resolver"
import { createEmailDocument, type EmailDocument } from "./document"

export function buildDemoDocument(): EmailDocument {
  const fixture = emailPromotionFixtures.find((entry) => entry.id === "R4-B")!
  const resolution = resolvePromotionDraft(fixture.request, fixture.draft)
  if (resolution.status !== "resolved") throw new Error(`Fixture R4-B : ${resolution.status}.`)
  return createEmailDocument(resolution.config, { facts: { promotion: fixture.request.promotion }, provenance: { origin: "recipe", recipe: "promotion" } })
}
