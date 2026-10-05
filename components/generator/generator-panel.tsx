"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { describeFieldPath, factsInputError, type GeneratorFormValues } from "@/lib/landing/brief"
import type { PublicGenerationError } from "@/lib/landing/public-api"

type GeneratorPanelProps = {
  brief: GeneratorFormValues
  objectives: readonly { value: string; label: string }[]
  /** Erreur de la dernière génération ; l'aperçu précédent reste affiché. */
  error: PublicGenerationError | null
  pending: boolean
  /** Validation légère pour l'UX : le serveur reste l'autorité. */
  canGenerate: boolean
  /** « Générer », « Génération… » ou « Régénérer » : dérivé de l'état de la page. */
  submitLabel: string
  onBriefChange: (brief: GeneratorFormValues) => void
  onGenerate: () => void
}

export function GeneratorPanel({
  brief,
  objectives,
  error,
  pending,
  canGenerate,
  submitLabel,
  onBriefChange,
  onGenerate,
}: GeneratorPanelProps) {
  const update = <Key extends keyof GeneratorFormValues>(
    key: Key,
    value: GeneratorFormValues[Key]
  ) => onBriefChange({ ...brief, [key]: value })
  const factsError = factsInputError(brief.facts)
  // Un seul objectif est servi par le moteur : présenté en lecture seule, la valeur envoyée ne change pas.
  const objective = objectives.find((item) => item.value === brief.objective)

  return (
    <form
      aria-labelledby="brief-title"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        onGenerate()
      }}
    >
      <header className="flex flex-col gap-1">
        <h2 id="brief-title" className="text-body font-semibold">
          Brief
        </h2>
        <p className="text-caption text-muted-foreground">
          Décrivez la landing page à générer.
        </p>
      </header>

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="generator-project">Nom du projet</FieldLabel>
          <Input
            id="generator-project"
            placeholder="Ex. Reconversion RH"
            value={brief.projectName}
            onChange={(event) => update("projectName", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="generator-brief">Brief</FieldLabel>
          <Textarea
            id="generator-brief"
            rows={6}
            placeholder="Ex. Présenter les formations RH à des professionnels en poste qui envisagent une reconversion."
            value={brief.brief}
            onChange={(event) => update("brief", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="generator-audience">Audience</FieldLabel>
          <Input
            id="generator-audience"
            placeholder="Ex. Professionnels en poste souhaitant changer de métier"
            value={brief.audience}
            onChange={(event) => update("audience", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="generator-objective">Objectif</FieldLabel>
          <Input
            id="generator-objective"
            readOnly
            value={objective?.label ?? ""}
            className="bg-muted text-foreground"
          />
        </Field>

        <Field data-invalid={factsError ? true : undefined}>
          <FieldLabel htmlFor="generator-facts">
            Informations à reprendre telles quelles
          </FieldLabel>
          <Textarea
            id="generator-facts"
            rows={4}
            // `field-sizing: content` ignore `rows` : min-h-24 garantit environ 4 lignes visibles.
            className="min-h-24"
            aria-invalid={factsError ? true : undefined}
            aria-describedby="generator-facts-help"
            placeholder={"Ex. Date du live : 15 octobre 2026.\nHeure : 18h30."}
            value={brief.facts}
            onChange={(event) => update("facts", event.target.value)}
          />
          <FieldDescription id="generator-facts-help">
            Une information par ligne. Utilisez ce champ pour les dates,
            horaires ou autres informations factuelles que la page doit
            respecter.
          </FieldDescription>
          {factsError && <FieldError>{factsError}</FieldError>}
        </Field>
      </FieldGroup>

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          disabled={pending || !canGenerate}
          aria-busy={pending}
          className="w-full"
        >
          {pending && (
            <Spinner data-icon="inline-start" aria-label="Génération en cours" />
          )}
          {submitLabel}
        </Button>
        {pending && (
          <p className="text-caption text-muted-foreground" aria-live="polite">
            La génération peut prendre une vingtaine de secondes.
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive" aria-live="polite">
          <AlertTitle>Génération impossible</AlertTitle>
          <AlertDescription>
            <p>{error.message}</p>
            {error.fields && (
              <ul className="mt-2 flex flex-col gap-1">
                {error.fields.map((field, index) => (
                  <li key={index}>
                    <span className="font-medium">
                      {describeFieldPath(field.path)}
                    </span>{" "}
                    : {field.message}
                  </li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}
    </form>
  )
}
