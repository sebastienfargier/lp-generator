"use client"

import { useEffect, useRef, useState } from "react"
import { SendIcon, SparklesIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { ChatMessage, ChatProposal } from "@/lib/email-builder/assistant-chat"
import { describeProposal, isProposalStale } from "@/lib/email-builder/assistant-proposal"
import type { EmailDocument } from "@/lib/email-builder/document"
import type { EmailBlockType } from "@/lib/email/types"

type AssistantPanelProps = {
  messages: readonly ChatMessage[]
  pending: boolean
  /** Consultation d'une version : l'assistant ne travaille que sur le travail actuel. */
  readOnly: boolean
  /** Le travail COURANT : ce que les propositions décrivent et ce qui les rend périmées. */
  document: EmailDocument
  blockName: (type: EmailBlockType) => string
  onSend: (text: string) => void
  onApply: (messageId: string) => void
  onIgnore: (messageId: string) => void
  onClose: () => void
}

const starters = ["Qu'est-ce que tu en penses ?", "Rends-le plus direct", "Améliore le CTA"]

const clip = (value: string, length = 90) => (value.length > length ? `${value.slice(0, length - 1)}…` : value)

function ProposalCard({ messageId, proposal, document, readOnly, blockName, onApply, onIgnore }: { messageId: string; proposal: ChatProposal; document: EmailDocument; readOnly: boolean; blockName: AssistantPanelProps["blockName"]; onApply: (id: string) => void; onIgnore: (id: string) => void }) {
  const count = proposal.changes.length
  const sentence = `${count} contenu${count > 1 ? "s" : ""} ${count > 1 ? "changent" : "change"}`
  if (proposal.status === "applied") {
    return (
      <div className="rounded-lg border bg-muted/50 px-3 py-2 text-caption text-muted-foreground">
        <span className="font-medium text-foreground">Appliquée</span> · {proposal.summary} · {sentence}
      </div>
    )
  }
  if (proposal.status === "ignored") {
    return <div className="rounded-lg border border-dashed px-3 py-2 text-caption text-muted-foreground">Proposition ignorée · {proposal.summary}</div>
  }
  const stale = isProposalStale(proposal, document)
  if (stale) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed px-3 py-2 text-caption text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Proposition périmée</span> · {proposal.summary}
        </p>
        <p>L&apos;email a changé depuis cette proposition. Demande-moi de l&apos;actualiser.</p>
      </div>
    )
  }
  const items = describeProposal(document, proposal.changes, blockName)
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-background px-3 py-3 shadow-xs">
      <div className="flex flex-col gap-0.5">
        <p className="text-body font-medium">{proposal.summary}</p>
        <p className="text-caption text-muted-foreground">{sentence}</p>
      </div>
      <ul role="list" className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.target} className="flex flex-col gap-0.5 border-l-2 border-accent-1 pl-2.5 text-caption">
            <span className="text-muted-foreground">
              {item.blockName} · {item.label}
            </span>
            <span className="text-muted-foreground line-through decoration-muted-foreground/40">{clip(item.before)}</span>
            <span className="text-foreground">{clip(item.after)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" size="xs" variant="ghost" onClick={() => onIgnore(messageId)}>
          Ignorer
        </Button>
        <Button type="button" size="xs" disabled={readOnly} onClick={() => onApply(messageId)}>
          Appliquer
        </Button>
      </div>
    </div>
  )
}

/**
 * L'assistant éditorial, côté navigateur : une conversation sobre. L'assistant
 * conseille ou prépare une proposition ; rien ne change dans l'email tant que la
 * personne n'a pas cliqué « Appliquer ». Le panneau ne connaît ni le modèle ni
 * le réseau : il reçoit des messages et renvoie des gestes.
 */
export function AssistantPanel({ messages, pending, readOnly, document, blockName, onSend, onApply, onIgnore, onClose }: AssistantPanelProps) {
  const [draft, setDraft] = useState("")
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" })
  }, [messages.length, pending])

  const canSend = !pending && !readOnly && draft.trim() !== ""
  function submit(text: string) {
    if (pending || readOnly || text.trim() === "") return
    onSend(text)
    setDraft("")
  }

  return (
    <aside aria-label="Assistant Studi" className="hidden w-80 shrink-0 flex-col border-l bg-background xl:flex">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
        <h2 className="flex items-center gap-2 text-body font-semibold">
          <SparklesIcon className="size-4 text-muted-foreground" aria-hidden />
          Assistant Studi
        </h2>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Replier l'assistant" onClick={onClose}>
          <XIcon aria-hidden />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="Conversation avec l'assistant">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-body text-muted-foreground">Je peux relire cet email, proposer des améliorations ou retravailler son contenu.</p>
            <div className="flex flex-wrap gap-2">
              {starters.map((starter) => (
                <button key={starter} type="button" disabled={readOnly} onClick={() => submit(starter)} className="rounded-full border px-3 py-1 text-caption text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50">
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message) =>
          message.role === "user" ? (
            <p key={message.id} className="max-w-[90%] self-end rounded-2xl rounded-br-sm bg-muted px-3 py-2 text-body">
              {message.text}
            </p>
          ) : (
            <div key={message.id} className="flex flex-col gap-2">
              <p className={`text-body ${message.failed ? "text-destructive" : ""}`}>{message.text}</p>
              {message.proposal && <ProposalCard messageId={message.id} proposal={message.proposal} document={document} readOnly={readOnly} blockName={blockName} onApply={onApply} onIgnore={onIgnore} />}
            </div>
          ),
        )}
        {pending && (
          <p role="status" className="flex items-center gap-2 text-caption text-muted-foreground">
            <Spinner aria-hidden />
            L&apos;assistant réfléchit…
          </p>
        )}
        <div ref={end} />
      </div>

      <form
        className="flex shrink-0 flex-col gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault()
          submit(draft)
        }}
      >
        {readOnly && <p className="text-caption text-muted-foreground">Reviens au travail actuel pour utiliser l&apos;assistant.</p>}
        <div className="flex items-end gap-2">
          <textarea
            aria-label="Message à l'assistant"
            rows={2}
            value={draft}
            disabled={readOnly}
            placeholder="Demande-lui un avis ou une modification"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                submit(draft)
              }
            }}
            className="min-h-14 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-body outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          />
          <Button type="submit" size="icon" aria-label="Envoyer" disabled={!canSend}>
            <SendIcon aria-hidden />
          </Button>
        </div>
      </form>
    </aside>
  )
}
