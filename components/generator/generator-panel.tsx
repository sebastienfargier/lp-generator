"use client"

import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"
import type { GeneratorBrief } from "@/lib/landing/brief"

type GeneratorPanelProps = {
  brief: GeneratorBrief
  objectives: readonly { value: string; label: string }[]
  onBriefChange: (brief: GeneratorBrief) => void
}

/**
 * Brief de la landing page. La génération n'est pas encore branchée : le
 * bouton reste désactivé et le formulaire n'envoie aucune requête.
 */
export function GeneratorPanel({
  brief,
  objectives,
  onBriefChange,
}: GeneratorPanelProps) {
  const update = <Key extends keyof GeneratorBrief>(
    key: Key,
    value: GeneratorBrief[Key]
  ) => onBriefChange({ ...brief, [key]: value })

  return (
    <form
      aria-labelledby="brief-title"
      className="flex flex-col gap-4"
      onSubmit={(event) => event.preventDefault()}
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
          <Select
            items={objectives}
            value={brief.objective || null}
            onValueChange={(value) => {
              const objective = objectives.find((item) => item.value === value)
              if (objective) update("objective", objective.value)
            }}
          >
            <SelectTrigger id="generator-objective" className="w-full">
              <SelectValue placeholder="Choisir un objectif" />
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

      <div className="flex flex-col gap-2">
        <Button type="submit" disabled className="w-full" aria-describedby="generator-status">
          Générer la landing page
        </Button>
        <p id="generator-status" className="text-caption text-muted-foreground">
          La génération par IA arrive au prochain checkpoint.
        </p>
      </div>
    </form>
  )
}
