/** Aides de test V2.8 : le Builder créé depuis une référence (état pur). */
import { builderDocument, createBuilderState, type BuilderState } from "../builder-state"
import type { EmailDocument } from "../document"

export const builderState = (document: EmailDocument, intro?: string): BuilderState => createBuilderState(document, intro)
export const builderDocumentOf = (state: BuilderState) => builderDocument(state)
