/**
 * Moteur d'édition conversationnelle : serveur uniquement.
 *
 * email courant (Draft de sa famille) + demande d'origine + instruction
 *   → garde-fous déterministes AVANT appel (valeur, code, date, légal, lien,
 *     visuel, structure, adresse)
 *   → vue éditoriale compacte + contexte Brand de la famille
 *   → UN appel `messages.create` → PATCH de champs de texte
 *   → patch validé (champs de la liste fermée, texte brut)
 *   → copie du Draft modifiée → resolver de la famille (EmailConfig, schéma,
 *     recette, valeurs contrôlées, terminologie)
 *   → comparaison avant / après de tout ce qui est protégé
 *   → voix (tu / vous) des textes modifiés
 *   → nouveau Draft + EmailConfig. Le rendu est fait par l'appelant.
 *
 * Claude ne voit ni ne produit jamais de HTML. Il ne peut nommer que des
 * champs de texte ; valeur, code, date, périmètre, légal, liens, images,
 * claims et footer viennent de la demande et des resolvers existants, qui
 * recomposent l'email : la protection ne repose pas sur la bonne volonté du
 * modèle. Les générations initiales (R1 à R4) ne sont pas modifiées.
 *
 * Un seul appel, aucune relance (`maxRetries: 0`), aucun repli : en cas
 * d'erreur, l'email précédent reste celui de l'appelant. La clé n'apparaît ni
 * dans les résultats, ni dans les erreurs, ni dans les journaux.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { brandPolicyFailure } from "./anthropic-v2"
import {
  createClient,
  EMAIL_MAX_TOKENS,
  failure,
  mapApiError,
  readStructuredOutput,
  resolveEmailModel,
  type CreateParams,
  type EmailClaudeDependencies,
  type EmailClaudeUsage,
  type EmailEngineError,
  type EmailGenerationErrorKind,
} from "./anthropic"
import { applyEmailComposition, compositionCapabilities, compositionViolations, describeLayout, safeParseEmailComposition, type CompositionCapabilities, type CompositionOperation, type EmailComposition } from "./composition"
import { addedFacts, checkEditInstruction, voiceViolations } from "./edit-guard"
import { buildExportableEmailHtml, validateExportHtml } from "./export-html"
import { buildEmailVisualIntentView, emailVisualIntents } from "./image-bank"
import { renderEmail } from "./renderer"
import { editableFields, getDraftText, setDraftTexts, type EmailEditFamily } from "./edit-fields"
import { safeParseEditPatch } from "./edit-patch"
import { buildEditPrompt } from "./edit-prompt"
import { protectedChanges } from "./edit-protect"
import { formatPromotionDate, isEmailPromotionInput, promotionOfferValue, promotionScopeSentence } from "./promotion-facts"
import { checkPromotionRequest } from "./promotion-prompt"
import { resolvePromotionDraft } from "./promotion-resolver"
import { buildPromotionBrandContext, buildRecipeBrandContext } from "./recipe-brand-context"
import { resolveEmailRecipeDraft } from "./recipe-drafts"
import { safeParseEmailRecipeRequest, selectEmailRecipe, type EmailRecipeRequest } from "./recipe-selection"
import type { EmailPromotionRequest } from "./promotion-facts"
import type { EmailConfig } from "./types"
import type { EmailRecipeDiagnostic } from "./recipe-validation"
import type { EmailRecipeId } from "./recipes"

export type EmailEditErrorKind = EmailGenerationErrorKind | "edit-refused" | "protected-mutation" | "no-change"

export type EmailEditError = Omit<EmailEngineError, "kind"> & { kind: EmailEditErrorKind; /** Motif d'un refus avant appel, pour l'utilisateur. */ reason?: string }

export type EmailEditInput = {
  /** Requête qui a servi à la génération (ou à la dernière version) : sa recette et ses valeurs contrôlées. */
  request: EmailRecipeRequest | EmailPromotionRequest
  /** Draft de la version courante (non fiable : il est revalidé et recomposé). */
  draft: unknown
  /** Composition (V1.5) de la version courante : les opérations déjà appliquées. Absente : aucune. */
  composition?: unknown
  instruction: string
}

export type EmailEditResult =
  | {
      status: "success"
      family: EmailEditFamily
      config: EmailConfig
      draft: unknown
      /** Composition de la nouvelle version : celle de la version courante, plus les opérations de cette édition. */
      composition?: EmailComposition
      /** Champs de texte modifiés (chemins du Draft) et opérations de composition appliquées. */
      changed: string[]
      summary: string
      diagnostics: EmailRecipeDiagnostic[]
      model: string
      stopReason: string
      usage?: EmailClaudeUsage
      requestId?: string
    }
  | { status: "error"; error: EmailEditError }

type Meta = { usage?: EmailClaudeUsage; requestId?: string }

const error = (value: EmailEditError): { status: "error"; error: EmailEditError } => ({ status: "error", error: value })

/** Résolution hors ligne d'un Draft → EmailConfig, pour la famille (resolvers existants). */
function resolveFamily(family: EmailEditFamily, request: EmailRecipeRequest | EmailPromotionRequest, draft: unknown) {
  return family === "promotion"
    ? resolvePromotionDraft(request as EmailPromotionRequest, draft)
    : resolveEmailRecipeDraft(request as EmailRecipeRequest, family as EmailRecipeId, draft)
}

type Resolution = ReturnType<typeof resolveFamily>

const toIssues = (issues: readonly { path: string; message: string }[]) => issues.map(({ path, message }) => ({ path, message }))

/** Résolution qui échoue → erreur du moteur (mêmes types que la génération). */
function resolutionFailure(resolution: Exclude<Resolution, { status: "resolved" }>, meta: Meta, output?: string) {
  const kinds = { "invalid-draft": "invalid-draft", "invalid-composition": "draft-resolution", "invalid-config": "invalid-config", "invalid-recipe": "validation-failed" } as const
  const messages = {
    "invalid-draft": "Le texte modifié ne respecte pas le contrat de la recette.",
    "invalid-composition": "Le texte modifié ne peut pas être assemblé.",
    "invalid-config": "L'email modifié est refusé par le contrat EmailConfig.",
    "invalid-recipe": "L'email modifié ne respecte pas les règles de contenu.",
  } as const
  return error({ ...meta, kind: kinds[resolution.status], message: messages[resolution.status], issues: toIssues(resolution.issues), ...(output ? { output } : {}) })
}

/** Famille et requête validée de l'email courant, sans appel de modèle. */
function prepare(request: unknown): { family: EmailEditFamily; request: EmailRecipeRequest | EmailPromotionRequest } | { error: EmailEditError } {
  const withoutSubject = (value: unknown) => {
    if (!value || typeof value !== "object") return value
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => key !== "subject"))
  }
  // L'objet imposé à la génération est déjà dans le Draft courant : l'édition peut le modifier.
  const input = withoutSubject(request)
  if (isEmailPromotionInput(input)) {
    const check = checkPromotionRequest(input)
    if (check.status === "invalid") return { error: { kind: "invalid-request", message: "La demande d'origine n'est plus valide.", issues: check.issues } }
    return { family: "promotion", request: check.request }
  }
  const parsed = safeParseEmailRecipeRequest(input)
  if (!parsed.success) {
    return { error: { kind: "invalid-request", message: "La demande d'origine est invalide.", issues: parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "request", message: issue.message })) } }
  }
  const selection = selectEmailRecipe(parsed.data)
  if (selection.status !== "selected") return { error: { kind: "unsupported", message: selection.issues.map((issue) => issue.message).join(" ") } }
  return { family: selection.recipe, request: parsed.data }
}

/** Valeurs protégées citables dans une instruction : elles servent à refuser « remplace X par Y » avant l'appel. */
function protectedTokens(family: EmailEditFamily, request: EmailRecipeRequest | EmailPromotionRequest, claimStatements: readonly string[]): string[] {
  if (family === "promotion") {
    const { promotion } = request as EmailPromotionRequest
    return [promotion.code ?? "", promotionOfferValue(promotion), formatPromotionDate(promotion.endDate), promotion.endDate.split("-").reverse().join("/")].filter(Boolean)
  }
  return claimStatements.flatMap((statement) => statement.match(/\d[\d  ]*\d|\d/g) ?? [])
}

/**
 * Email VISIBLE d'une version : le resolver de la famille (pré-composition),
 * puis les opérations de composition rejouées. Partagé avec l'export.
 */
function visibleEmail(family: EmailEditFamily, request: EmailRecipeRequest | EmailPromotionRequest, preComposition: EmailConfig, composition: EmailComposition) {
  return applyEmailComposition(preComposition, composition, { family, ...(family === "promotion" ? { promotion: (request as EmailPromotionRequest).promotion } : {}) })
}

/** Les capacités de l'email courant, en entrée du garde-fou avant appel. */
const guardCapabilities = (capabilities: CompositionCapabilities | undefined) => ({
  image: capabilities?.operations.includes("change-image") === true,
  surface: capabilities?.operations.includes("change-surface") === true,
  sections: capabilities?.operations.includes("add-section") === true,
})

/**
 * Applique UNE instruction d'édition à l'email courant. Ne lève pas : renvoie un
 * résultat. Une instruction interdite ou une demande invalide n'appelle jamais
 * Anthropic.
 */
export async function editEmailV2(input: EmailEditInput, dependencies: EmailClaudeDependencies = {}): Promise<EmailEditResult> {
  /* 1. Demande d'origine → famille */
  const prepared = prepare(input.request)
  if ("error" in prepared) return error(prepared.error)
  const { family, request } = prepared

  /* 2. Email courant : le Draft et la composition (clients, donc non fiables) doivent se recomposer */
  const parsedComposition = safeParseEmailComposition(input.composition)
  if (!parsedComposition.success) return error({ kind: "invalid-request", message: "La composition de l'email est invalide.", issues: parsedComposition.error.issues.map((issue) => ({ path: `composition.${issue.path.join(".")}`, message: issue.message })) })
  const composition = parsedComposition.data
  const base = resolveFamily(family, request, input.draft)
  if (base.status !== "resolved") return resolutionFailure(base, {})
  const current = visibleEmail(family, request, base.config, composition)
  if (!current.ok) return error({ kind: "invalid-request", message: "La composition de l'email ne s'applique plus : régénérez-le.", issues: [{ path: `composition.operations.${current.index}`, message: current.message }] })
  const claimStatements = "claims" in base ? base.claims.map((claim) => claim.statement) : []
  const capabilities = compositionCapabilities(family, current.config)

  /* 3. Contexte Brand de la famille : voix, règles, formulations à éviter */
  const { context } = family === "promotion" ? buildPromotionBrandContext(request.audience, request.target) : buildRecipeBrandContext(family, request.audience, request.target)

  /* 4. Garde-fous avant appel */
  const refusal = checkEditInstruction(input.instruction, { address: context.voice.address, protectedTokens: protectedTokens(family, request, claimStatements), capabilities: guardCapabilities(capabilities) })
  if (refusal) return error({ kind: "edit-refused", message: refusal.message, reason: refusal.message })

  /* 5. Vue éditoriale compacte (champs de la liste fermée) et prompt */
  const fields = editableFields(family, input.draft, current.config).flatMap((entry) => {
    const text = getDraftText(input.draft, entry.path)
    return text === undefined ? [] : [{ ...entry, text }]
  })
  const protectedFacts: Record<string, unknown> =
    family === "promotion"
      ? { offer: { value: promotionOfferValue((request as EmailPromotionRequest).promotion).replace(/\u00a0/g, " "), scope: (request as EmailPromotionRequest).promotion.scope } }
      : {
          ...(family === "brand-proof" ? { proofs: claimStatements } : {}),
          ...((request as EmailRecipeRequest).facts?.length ? { facts: (request as EmailRecipeRequest).facts!.map((fact) => fact.statement) } : {}),
        }
  const allowedIntents = capabilities ? (capabilities.values as string[]).filter((value) => (emailVisualIntents as readonly string[]).includes(value)) : []
  const prompt = buildEditPrompt({
    family,
    instruction: input.instruction,
    fields,
    protectedFacts,
    context,
    ...(capabilities ? { capabilities, layout: describeLayout(family, current.config), imageIntents: buildEmailVisualIntentView().filter((entry) => allowedIntents.includes(entry.intent)) } : {}),
  })

  /* 6. Clé et client */
  const env = dependencies.env ?? process.env
  const apiKey = env.ANTHROPIC_API_KEY?.trim()
  const secrets = apiKey ? [apiKey] : []
  let client = dependencies.client
  if (!client) {
    if (!apiKey) return failure({ kind: "missing-api-key", message: "ANTHROPIC_API_KEY est absente : ajoutez-la côté serveur (.env.local)." })
    try {
      client = createClient(apiKey)
    } catch (caught) {
      return failure(mapApiError(caught, secrets))
    }
  }

  /* 7. UN appel : Messages API + Structured Outputs, avec le SEUL schéma du patch de cette famille */
  const model = resolveEmailModel(env)
  const params: CreateParams = {
    model,
    max_tokens: EMAIL_MAX_TOKENS,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
    output_config: { format: { type: "json_schema", schema: prompt.transportSchema } },
  }
  let response
  try {
    response = await client.messages.create(params)
  } catch (caught) {
    return failure(mapApiError(caught, secrets))
  }
  const read = readStructuredOutput(response)
  if (!read.ok) return read.failure

  /* 8. Patch : champs de la liste fermée (texte brut) et opérations de la liste fermée */
  const patch = safeParseEditPatch(prompt.paths, read.output, capabilities)
  if (!patch.success) {
    return error({ ...read.meta, kind: "invalid-draft", message: "La modification proposée ne respecte pas le contrat attendu.", issues: patch.error.issues.map((issue) => ({ path: issue.path.join(".") || "patch", message: issue.message })), output: read.text })
  }
  const edits = patch.data.edits.map((edit) => ({ path: edit.field, text: edit.text }))
  const operations = ((patch.data as { operations?: CompositionOperation[] }).operations ?? []) as CompositionOperation[]
  // Un texte identique à l'actuel n'est pas une modification.
  const effective = edits.filter((edit) => getDraftText(input.draft, edit.path) !== edit.text)
  if (effective.length === 0 && operations.length === 0) {
    // Rien à faire : le résumé du modèle dit pourquoi (par exemple une couleur qui n'existe pas).
    return error({ ...read.meta, kind: "no-change", message: "Aucune modification n'a été proposée : l'email reste tel quel.", reason: patch.data.summary.trim() })
  }

  /* 9. Draft modifié → resolver de la famille (schéma, recette, valeurs contrôlées, terminologie) */
  let next: unknown = input.draft
  if (effective.length > 0) {
    try {
      next = setDraftTexts(input.draft, effective)
    } catch {
      return error({ ...read.meta, kind: "invalid-draft", message: "La modification vise un champ inconnu.", output: read.text })
    }
  }
  const resolution = effective.length > 0 ? resolveFamily(family, request, next) : base
  if (resolution.status !== "resolved") return resolutionFailure(resolution, read.meta, read.text)
  const blocked = brandPolicyFailure(resolution.policy, read.meta, read.text)
  if (blocked) return blocked as { status: "error"; error: EmailEditError }

  /* 10. Composition : les opérations s'ajoutent à celles de la version courante, rejouées sur le nouvel email */
  const nextComposition: EmailComposition = { operations: [...composition.operations, ...operations] }
  const visible = visibleEmail(family, request, resolution.config, nextComposition)
  if (!visible.ok) return error({ ...read.meta, kind: "edit-refused", message: visible.message, reason: visible.message })

  /* 11. Avant / après : les textes seuls changent (même composition des deux côtés) */
  const protectedTexts = [...claimStatements, ...(family === "promotion" ? [promotionScopeSentence((request as EmailPromotionRequest).promotion)] : [])]
  const sameComposition = visibleEmail(family, request, base.config, nextComposition)
  if (!sameComposition.ok) return error({ ...read.meta, kind: "edit-refused", message: sameComposition.message, reason: sameComposition.message })
  const violations: { path: string; message: string }[] = protectedChanges(sameComposition.config, visible.config, { protectedTexts })
  /* ... puis la composition seule change (même Draft des deux côtés) : valeurs, légal, preuves, liens identiques */
  const compositionContext = { family, ...(family === "promotion" ? { promotion: (request as EmailPromotionRequest).promotion } : {}) }
  if (operations.length > 0) {
    violations.push(...compositionViolations(current.config, sameComposition.config, operations, compositionContext, new Map(base.config.blocks.map((block) => [(block as unknown as { id: string }).id, block]))))
  }
  if (violations.length > 0) {
    return error({ ...read.meta, kind: "protected-mutation", message: "La modification touche des éléments protégés : l'email reste tel quel.", issues: toIssues(violations), output: read.text })
  }

  /* 12. Voix : tu / vous, selon la cible, sur les seuls textes modifiés */
  const voice = voiceViolations(effective, context.voice.address)
  if (voice.length > 0) {
    return error({ ...read.meta, kind: "brand-violation", message: "Le texte modifié ne respecte pas l'adresse de la cible.", issues: voice.map((entry) => ({ path: entry.path, message: `« ${entry.match} » : adresse incompatible avec la cible.` })), output: read.text })
  }
  /* 13. Aucun fait flou nouveau (« des centaines de… », conditions de l'offre) */
  const added = addedFacts(family, effective.map((edit) => ({ path: edit.path, before: getDraftText(input.draft, edit.path) ?? "", after: edit.text })))
  if (added.length > 0) {
    return error({ ...read.meta, kind: "validation-failed", message: "Le texte modifié introduit un fait qui ne figure pas dans l'email.", issues: added.map((entry) => ({ path: entry.path, message: `« ${entry.match} » : fait non fourni.` })), output: read.text })
  }
  if (JSON.stringify(visible.config) === JSON.stringify(current.config)) return error({ ...read.meta, kind: "no-change", message: "Aucune modification n'a été proposée : l'email reste tel quel." })

  /* 14. L'email obtenu doit rester exportable (assets et liens contrôlés) */
  try {
    const exported = buildExportableEmailHtml(renderEmail(visible.config), "https://assets.example.test")
    const issues = validateExportHtml(exported.html, { assetsBase: "https://assets.example.test", local: false })
    if (issues.length > 0) return error({ ...read.meta, kind: "validation-failed", message: "L'email modifié ne serait pas exportable.", issues: issues.map((entry) => ({ path: entry.code, message: entry.message })), output: read.text })
  } catch {
    return error({ ...read.meta, kind: "validation-failed", message: "L'email modifié ne serait pas exportable.", output: read.text })
  }

  return {
    status: "success",
    family,
    config: visible.config,
    draft: next,
    composition: nextComposition,
    changed: [...effective.map((edit) => edit.path), ...operations.map((operation) => `${operation.op}:${operation.target}:${operation.value}`)],
    summary: patch.data.summary.trim(),
    diagnostics: resolution.diagnostics,
    model: response.model || model,
    stopReason: "end_turn",
    ...read.meta,
  }
}

/**
 * Partage avec l'export HTML (`export-handler.ts`) : la même préparation de la
 * demande (sans l'objet imposé : le Draft courant porte l'objet final) et la
 * même recomposition d'un Draft par le resolver de sa famille.
 */
export { prepare as prepareEmailRequest, resolveFamily as resolveEmailFamilyDraft, visibleEmail }
