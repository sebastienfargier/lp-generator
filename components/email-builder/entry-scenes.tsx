import { ArrowRightIcon, PlusIcon } from "lucide-react"

import { EmailThumb } from "./email-thumb"

/** Les aperçus viennent de la route `/email-builder/preview/[id]` : de vrais emails rendus, jamais des captures. */
const previewSrc = (id: string) => `/email-builder/preview/${id}`

/** Les trois modèles de l'éventail (un par famille de composition) et ceux de la scène « référence ». */
export const fanTemplateIds = ["R1-A", "R2-A", "R3-A"] as const
export const referenceSourceId = "R2-A"
export const referenceResultId = "R1-A"

const chip = "rounded-full bg-background/95 px-2.5 py-1 text-caption text-foreground shadow-xs ring-1 ring-border"
const sheet = "shadow-md ring-1 ring-neutral-900/10"

/**
 * « Partir de zéro » : un email en construction. Le header et une lame de texte, réels, puis
 * l'emplacement de la prochaine lame, comme dans le Builder (« Ajouter une lame »).
 */
export function BlankStage() {
  return (
    <>
      <div className="absolute inset-x-[13%] top-5">
        <EmailThumb src={previewSrc("blank")} crop={712} className={`rounded-md ${sheet}`} />
      </div>
      <div className="absolute inset-x-[13%] bottom-5 flex h-14 items-center justify-center rounded-md border border-dashed border-neutral-400 bg-neutral-100/90">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-1 px-3 py-1 text-caption text-neutral-900">
          <PlusIcon className="size-3.5" aria-hidden />
          Ajouter une lame
        </span>
      </div>
    </>
  )
}

const fan = [
  "left-[3%] top-7 -rotate-6 motion-safe:group-hover:-translate-x-1.5 motion-safe:group-hover:-rotate-[8deg]",
  "left-[19%] top-3 z-10 motion-safe:group-hover:-translate-y-1",
  "left-[35%] top-8 rotate-6 motion-safe:group-hover:translate-x-1.5 motion-safe:group-hover:rotate-[8deg]",
] as const

/** « Partir d'un modèle » : trois vrais modèles Studi, légèrement superposés ; l'éventail s'ouvre de quelques degrés au survol. */
export function TemplateFan() {
  return (
    <>
      {fanTemplateIds.map((id, index) => (
        <div key={id} className={`absolute w-[60%] transition-transform duration-200 motion-reduce:transition-none ${fan[index]}`}>
          <EmailThumb src={previewSrc(id)} crop={1200} lazy={index > 0} className={`rounded-md ${sheet}`} />
        </div>
      ))}
    </>
  )
}

/**
 * « Créer depuis une référence » : une inspiration (un autre email, recadré, désaturé, légèrement
 * incliné, avec sa marge de capture) → une flèche → un email Studi, net et en couleurs. Deux
 * documents différents : l'inspiration n'est pas « la même image filtrée ».
 */
export function ReferenceStage() {
  return (
    <>
      <div className="absolute top-9 left-[4%] w-[52%] -rotate-3">
        <EmailThumb src={previewSrc(referenceSourceId)} crop={1200} offset={300} lazy className={`rounded-sm border-4 border-neutral-0 opacity-90 contrast-75 grayscale ${sheet}`} />
      </div>
      <span aria-hidden className="absolute top-1/2 left-1/2 z-20 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent-1 text-neutral-900 shadow-sm ring-1 ring-neutral-900/10">
        <ArrowRightIcon className="size-4" />
      </span>
      <div className="absolute top-4 right-[4%] z-10 w-[52%]">
        <EmailThumb src={previewSrc(referenceResultId)} crop={1200} lazy className={`rounded-md ${sheet}`} />
      </div>
      <span className={`absolute bottom-3 left-3 z-20 ${chip}`}>Inspiration</span>
      <span className={`absolute right-3 bottom-3 z-20 ${chip}`}>Version Studi</span>
    </>
  )
}

/** Un modèle du Builder, vu de haut : le début de l'email, pour choisir à l'œil. */
export function TemplateStage({ id }: { id: string }) {
  return (
    <div className="absolute inset-x-6 top-6">
      <EmailThumb src={previewSrc(id)} crop={1200} lazy className={`rounded-t-md ${sheet}`} />
    </div>
  )
}
