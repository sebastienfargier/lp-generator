"use client"

import { useReducer, useState } from "react"

import type { BuilderLame } from "@/lib/email-builder/catalog"
import type { EmailDocument } from "@/lib/email-builder/document"
import { saveKey, type HccSaved } from "@/lib/email-builder/hcc-save"
import type { DocumentStatus } from "@/lib/email-builder/versions"
import { createShell, shellReducer } from "@/lib/email-builder/shell-state"
import type { BuilderTemplate } from "@/lib/email-builder/templates"

import { BuilderWorkspace } from "./builder-workspace"
import { EntryScreen } from "./entry-screen"
import { ReferenceScreen } from "./reference-screen"

type BuilderShellProps = {
  lames: readonly BuilderLame[]
  templates: readonly BuilderTemplate[]
  /** Création ouverte depuis le HCC : document enregistré (`null` pour une création neuve), révision, statut éditorial. */
  hcc?: { assetId: string; assetName: string; revision: number; document: EmailDocument | null; editorialStatus: DocumentStatus }
}

/**
 * Ce qui entoure le Builder : « aucun email ouvert » (l'entrée, le choix d'un
 * modèle) ou « un email ouvert » (le Builder). Les trois chemins d'entrée
 * convergent vers LE MÊME `BuilderWorkspace`, avec un document de départ ; le
 * workspace est monté à neuf à chaque ouverture (`key`) : recommencer abandonne
 * tout le travail local, sans Undo qui traverse cette frontière.
 */
export function BuilderShell({ lames, templates, hcc }: BuilderShellProps) {
  // Un document déjà enregistré dans le HCC ouvre directement le Builder ; une création neuve passe par l'écran de départ.
  const [shell, dispatch] = useReducer(shellReducer, undefined, () => (hcc?.document ? { screen: "builder" as const, opened: 1, document: hcc.document } : createShell()))
  // Ce que le HCC contient : survit à « Recommencer » (nouvel espace de travail, même création HCC).
  const [saved, setSaved] = useState<HccSaved>(() => ({ revision: hcc?.revision ?? 0, key: hcc?.document ? saveKey(hcc.document, hcc.editorialStatus) : null }))

  if (shell.screen === "builder") {
    // Le statut éditorial enregistré ne s'applique qu'au document enregistré (première ouverture).
    const initialStatus = hcc?.document && shell.opened === 1 ? hcc.editorialStatus : undefined
    return (
      <BuilderWorkspace
        key={shell.opened}
        initialDocument={shell.document}
        {...(shell.intro ? { initialMessage: shell.intro } : {})}
        {...(hcc ? { hcc: { assetId: hcc.assetId, assetName: hcc.assetName, saved, onSaved: setSaved } } : {})}
        {...(initialStatus ? { initialStatus } : {})}
        lames={lames}
        onRestart={() => dispatch({ type: "restart" })}
      />
    )
  }
  if (shell.screen === "reference") {
    return <ReferenceScreen onBack={() => dispatch({ type: "back" })} onCreated={(document, intro) => dispatch({ type: "reference-created", document, intro })} />
  }
  return (
    <EntryScreen
      mode={shell.screen}
      templates={templates}
      onBlank={() => dispatch({ type: "choose-blank" })}
      onTemplates={() => dispatch({ type: "choose-templates" })}
      onReference={() => dispatch({ type: "choose-reference" })}
      onTemplate={(template) => dispatch({ type: "choose-template", document: template.document })}
      onBack={() => dispatch({ type: "back" })}
    />
  )
}
