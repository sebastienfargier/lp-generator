"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
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
import type { EmailBrief, EmailDemoPreset, EmailDemoVisual } from "@/lib/email/demo-generator"
import type { EmailGenerationError } from "@/lib/email/generation"

const presetGroups = [
  { value: "scenario", label: "Scénarios" },
  { value: "campagne", label: "Campagnes visuelles" },
] as const

type EmailBriefPanelProps = {
  brief: EmailBrief
  objectives: readonly { value: EmailBrief["objective"]; label: string }[]
  /** Briefs d'exemple : un clic préremplit le formulaire. */
  presets: readonly EmailDemoPreset[]
  /** Limite d'une campagne visuelle, affichée quand elle est choisie. */
  notices: Partial<Record<EmailDemoVisual, string>>
  /** Erreur de la dernière génération ; l'aperçu précédent reste affiché. */
  error: EmailGenerationError | null
  pending: boolean
  onBriefChange: (brief: EmailBrief) => void
  onGenerate: () => void
}

export function EmailBriefPanel({
  brief,
  objectives,
  presets,
  notices,
  error,
  pending,
  onBriefChange,
  onGenerate,
}: EmailBriefPanelProps) {
  const update = <Key extends keyof EmailBrief>(key: Key, value: EmailBrief[Key]) =>
    onBriefChange({ ...brief, [key]: value })
  const notice = brief.visual ? notices[brief.visual] : undefined

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
          Mode démo — email assemblé localement à partir des lames, sans IA.
        </p>
      </header>

      {presetGroups.map((group) => (
        <div key={group.value} role="group" aria-label={group.label} className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-muted-foreground">{group.label}</span>
          {presets
            .filter((preset) => preset.group === group.value)
            .map((preset) => {
              const active = JSON.stringify(preset.brief) === JSON.stringify(brief)
              return (
                <Button
                  key={preset.id}
                  type="button"
                  size="xs"
                  variant={active ? "secondary" : "outline"}
                  aria-pressed={active}
                  disabled={pending}
                  onClick={() => onBriefChange({ ...preset.brief })}
                >
                  {preset.label}
                </Button>
              )
            })}
        </div>
      ))}

      {notice && (
        <Alert aria-live="polite">
          <AlertTitle>Campagne visuelle de démonstration</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="email-campaign">Nom de campagne</FieldLabel>
          <Input
            id="email-campaign"
            value={brief.campaignName}
            onChange={(event) => update("campaignName", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="email-subject">Objet</FieldLabel>
          <Input
            id="email-subject"
            value={brief.subject}
            onChange={(event) => update("subject", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="email-brief">Brief</FieldLabel>
          <Textarea
            id="email-brief"
            rows={5}
            value={brief.brief}
            onChange={(event) => update("brief", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="email-audience">Audience</FieldLabel>
          <Input
            id="email-audience"
            value={brief.audience}
            onChange={(event) => update("audience", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="email-objective">Objectif</FieldLabel>
          <Select
            items={objectives}
            value={brief.objective}
            onValueChange={(value) => {
              const objective = objectives.find((item) => item.value === value)
              if (objective) update("objective", objective.value)
            }}
          >
            <SelectTrigger id="email-objective" className="w-full">
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
        {pending && <Spinner data-icon="inline-start" aria-label="Génération en cours" />}
        {pending ? "Génération…" : "Générer l'email"}
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
