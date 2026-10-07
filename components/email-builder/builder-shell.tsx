"use client"

import { useReducer } from "react"

import type { BuilderLame } from "@/lib/email-builder/catalog"
import { createShell, shellReducer } from "@/lib/email-builder/shell-state"
import type { BuilderTemplate } from "@/lib/email-builder/templates"

import { BuilderWorkspace } from "./builder-workspace"
import { EntryScreen } from "./entry-screen"
import { ReferenceScreen } from "./reference-screen"

type BuilderShellProps = {
  lames: readonly BuilderLame[]
  templates: readonly BuilderTemplate[]
}

/**
 * Ce qui entoure le Builder : « aucun email ouvert » (l'entrée, le choix d'un
 * modèle) ou « un email ouvert » (le Builder). Les trois chemins d'entrée
 * convergent vers LE MÊME `BuilderWorkspace`, avec un document de départ ; le
 * workspace est monté à neuf à chaque ouverture (`key`) : recommencer abandonne
 * tout le travail local, sans Undo qui traverse cette frontière.
 */
export function BuilderShell({ lames, templates }: BuilderShellProps) {
  const [shell, dispatch] = useReducer(shellReducer, undefined, createShell)

  if (shell.screen === "builder") {
    return <BuilderWorkspace key={shell.opened} initialDocument={shell.document} {...(shell.intro ? { initialMessage: shell.intro } : {})} lames={lames} onRestart={() => dispatch({ type: "restart" })} />
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
