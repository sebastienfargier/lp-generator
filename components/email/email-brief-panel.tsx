"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  describeEmailError,
  emailFactsInputError,
  type EmailGeneratorExample,
  type EmailGeneratorForm,
  type EmailGeneratorIntent,
  type EmailGeneratorTarget,
} from "@/lib/email/generator-form"
import type { EmailGeneratorError } from "@/lib/email/generator-state"

type EmailBriefPanelProps = {
  form: EmailGeneratorForm
  /** Intentions métier : l'utilisateur ne voit jamais la recette que le moteur en déduit. */
  intents: readonly { value: EmailGeneratorIntent; label: string; hint: string }[]
  /** Cibles : les audiences de la marque ; elles décident de la voix côté serveur. */
  targets: readonly { value: EmailGeneratorTarget; label: string }[]
  /** Exemples de brief : un clic préremplit le formulaire, sans lancer de génération. */
  examples: readonly EmailGeneratorExample[]
  /** Erreur de la dernière génération ; l'aperçu précédent reste affiché. */
  error: EmailGeneratorError | null
  pending: boolean
  /** Validation légère pour l'UX : le serveur reste l'autorité. */
  canGenerate: boolean
  /** « Générer l'email », « Génération… » ou « Régénérer » : dérivé de l'état de la page. */
  submitLabel: string
  onFormChange: (form: EmailGeneratorForm) => void
  onGenerate: () => void
}

const optional = <span className="font-normal text-muted-foreground">(facultatif)</span>

export function EmailBriefPanel({
  form,
  intents,
  targets,
  examples,
  error,
  pending,
  canGenerate,
  submitLabel,
  onFormChange,
  onGenerate,
}: EmailBriefPanelProps) {
  const update = <Key extends keyof EmailGeneratorForm>(key: Key, value: EmailGeneratorForm[Key]) =>
    onFormChange({ ...form, [key]: value })
  const factsError = emailFactsInputError(form.facts)
  const errorView = error ? describeEmailError(error) : null

  return (
    <form
      aria-labelledby="email-brief-title"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        onGenerate()
      }}
    >
      <header className="flex flex-col gap-1">
        <h2 id="email-brief-title" className="text-body font-semibold">
          Brief
        </h2>
        <p className="text-caption text-muted-foreground">
          Décrivez l&apos;email à générer. Tous les champs sont obligatoires, sauf ceux marqués « facultatif ».
        </p>
      </header>

      <div role="group" aria-label="Exemples" className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-muted-foreground">Exemples</span>
        {examples.map((example) => {
          const active = JSON.stringify(example.form) === JSON.stringify(form)
          return (
            <Button
              key={example.id}
              type="button"
              size="xs"
              variant={active ? "secondary" : "outline"}
              aria-pressed={active}
              disabled={pending}
              onClick={() => onFormChange({ ...example.form })}
            >
              {example.label}
            </Button>
          )
        })}
      </div>

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="email-campaign">Nom de campagne</FieldLabel>
          <Input
            id="email-campaign"
            required
            placeholder="Ex. Trouver sa voie avec Studi"
            value={form.campaignName}
            onChange={(event) => update("campaignName", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="email-intent">Intention</FieldLabel>
          <Select
            items={intents}
            value={form.intent || null}
            onValueChange={(value) => {
              const intent = intents.find((item) => item.value === value)
              if (intent) update("intent", intent.value)
            }}
          >
            <SelectTrigger id="email-intent" className="w-full">
              <SelectValue placeholder="Choisir une intention" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {intents.map((intent) => (
                  <SelectItem key={intent.value} value={intent.value}>
                    {intent.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>{intents.find((item) => item.value === form.intent)?.hint ?? "Ce que l'email doit permettre."}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="email-target">Cible</FieldLabel>
          <Select
            items={targets}
            value={form.target || null}
            onValueChange={(value) => {
              const target = targets.find((item) => item.value === value)
              if (target) update("target", target.value)
            }}
          >
            <SelectTrigger id="email-target" className="w-full">
              <SelectValue placeholder="Choisir une cible" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {targets.map((target) => (
                  <SelectItem key={target.value} value={target.value}>
                    {target.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>Elle règle le ton et l&apos;adresse de l&apos;email.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="email-brief">Brief</FieldLabel>
          <Textarea
            id="email-brief"
            required
            rows={5}
            aria-describedby="email-brief-help"
            placeholder="Ex. Aider les lecteurs à clarifier leur projet et à découvrir les formations Studi."
            value={form.brief}
            onChange={(event) => update("brief", event.target.value)}
          />
          <FieldDescription id="email-brief-help">L&apos;intention éditoriale : ton, message, ce que le lecteur doit comprendre.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="email-subject">Objet {optional}</FieldLabel>
          <Input
            id="email-subject"
            aria-describedby="email-subject-help"
            value={form.subject}
            onChange={(event) => update("subject", event.target.value)}
          />
          <FieldDescription id="email-subject-help">Laissez vide : l&apos;IA le propose.</FieldDescription>
        </Field>

        <Field data-invalid={factsError ? true : undefined}>
          <FieldLabel htmlFor="email-facts">
            Informations à reprendre telles quelles {optional}
          </FieldLabel>
          <Textarea
            id="email-facts"
            rows={4}
            // `field-sizing: content` ignore `rows` : min-h-24 garantit environ 4 lignes visibles.
            className="min-h-24"
            aria-invalid={factsError ? true : undefined}
            aria-describedby="email-facts-help"
            placeholder={"Ex. Les formations sont accessibles en ligne.\nUn conseiller répond aux questions."}
            value={form.facts}
            onChange={(event) => update("facts", event.target.value)}
          />
          <FieldDescription id="email-facts-help">
            Ajoutez ici les chiffres, dates ou informations qui doivent être respectés. Un élément par ligne.
          </FieldDescription>
          {factsError && <FieldError>{factsError}</FieldError>}
        </Field>
      </FieldGroup>

      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={pending || !canGenerate} aria-busy={pending} className="w-full">
          {pending && <Spinner data-icon="inline-start" aria-label="Génération en cours" />}
          {submitLabel}
        </Button>
        {pending && (
          <p className="text-caption text-muted-foreground" aria-live="polite">
            La génération peut prendre une quinzaine de secondes.
          </p>
        )}
      </div>

      {errorView && (
        <Alert variant="destructive" aria-live="polite">
          <AlertTitle>{errorView.title}</AlertTitle>
          <AlertDescription>
            {errorView.messages.length > 1 ? (
              <ul className="flex flex-col gap-1">
                {errorView.messages.map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            ) : (
              <p>{errorView.messages[0]}</p>
            )}
            <p className="mt-2">{errorView.hint}</p>
          </AlertDescription>
        </Alert>
      )}
    </form>
  )
}
