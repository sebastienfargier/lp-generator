"use client"

import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
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
import type {
  GenerationError,
  GeneratorBrief,
} from "@/lib/generator/generate"

type GeneratorPanelProps = {
  brief: GeneratorBrief
  objectives: readonly { value: string; label: string }[]
  /** Erreur de la dernière génération ; l'aperçu précédent reste affiché. */
  error: GenerationError | null
  pending: boolean
  onBriefChange: (brief: GeneratorBrief) => void
  onGenerate: () => void
}

export function GeneratorPanel({
  brief,
  objectives,
  error,
  pending,
  onBriefChange,
  onGenerate,
}: GeneratorPanelProps) {
  const update = <Key extends keyof GeneratorBrief>(
    key: Key,
    value: GeneratorBrief[Key]
  ) => onBriefChange({ ...brief, [key]: value })

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
          Mode démo — génération simulée localement.
        </p>
      </header>

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="generator-project">Nom du projet</FieldLabel>
          <Input
            id="generator-project"
            value={brief.projectName}
            onChange={(event) => update("projectName", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="generator-brief">Brief</FieldLabel>
          <Textarea
            id="generator-brief"
            rows={6}
            value={brief.brief}
            onChange={(event) => update("brief", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="generator-audience">Audience</FieldLabel>
          <Input
            id="generator-audience"
            value={brief.audience}
            onChange={(event) => update("audience", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="generator-objective">Objectif</FieldLabel>
          <Select
            items={objectives}
            value={brief.objective}
            onValueChange={(value) => {
              const objective = objectives.find((item) => item.value === value)
              if (objective) update("objective", objective.value)
            }}
          >
            <SelectTrigger id="generator-objective" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {objectives.map((objective) => (
                  <SelectItem key={objective.value} value={objective.value}>
                    {objective.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={pending} className="w-full">
        {pending && (
          <Spinner data-icon="inline-start" aria-label="Génération en cours" />
        )}
        {pending ? "Génération…" : "Générer la landing page"}
      </Button>

      {error && (
        <Alert variant="destructive" aria-live="polite">
          <AlertTitle>{error.title}</AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-2">
              {error.issues.map((issue, index) => (
                <li key={index}>
                  <code className="font-mono text-caption">{issue.path}</code>
                  <p>{issue.message}</p>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </form>
  )
}
