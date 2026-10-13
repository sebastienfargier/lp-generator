/**
 * Assistant éditorial + brief HCC (option B) : SERVEUR UNIQUEMENT. La route reste enveloppée par `withBuilderSession`
 * (origine, session, limitation) ; ici, la session déjà vérifiée est relue pour son jeton (sans recompter la limite),
 * puis le brief de l'asset DE LA SESSION est relu au HCC — jamais un brief ni un asset venus du navigateur. Seul un brief
 * « disponible » est transmis au moteur ; absent ou indisponible : l'assistant travaille sans brief.
 */
import { handleAssistant, type AssistantHandlerOptions } from "../email-builder/assistant-handler"
import { fetchHccBrief, type HccBriefState } from "./brief"
import { tryReadHccConfig } from "./config"
import type { HccCallDependencies } from "./documents"
import { guardRequest } from "./guard"

export type AssistantBriefDependencies = HccCallDependencies & { env?: Readonly<Record<string, string | undefined>>; handler?: AssistantHandlerOptions }

export function assistantWithHccBrief(dependencies: AssistantBriefDependencies = {}) {
  return async (request: Request): Promise<Response> => {
    const env = dependencies.env ?? process.env
    const guard = guardRequest(request, { env, ...(dependencies.now ? { now: dependencies.now } : {}) })
    if (!guard.ok) return guard.response
    const config = tryReadHccConfig(env)
    const lu: HccBriefState = config ? await fetchHccBrief(config, guard.session.token, guard.session.assetId, dependencies) : { status: "indisponible" }
    return handleAssistant(request, { ...dependencies.handler, env, brief: lu.status === "disponible" ? lu.brief : null })
  }
}
