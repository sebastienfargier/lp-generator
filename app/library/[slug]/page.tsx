import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react"

import { PageContainer } from "@/components/layout/page-container"
import { CopyButton } from "@/components/library/copy-button"
import {
  getLibrarySection,
  librarySections,
} from "@/components/library/registry"
import { SectionPreview } from "@/components/library/section-preview"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const dynamicParams = false

export function generateStaticParams() {
  return librarySections.map((section) => ({ slug: section.slug }))
}

export async function generateMetadata(
  props: PageProps<"/library/[slug]">
): Promise<Metadata> {
  const { slug } = await props.params
  const section = getLibrarySection(slug)
  return { title: section ? `${section.name} · Bibliothèque de lames` : undefined }
}

export default async function LibrarySectionPage(
  props: PageProps<"/library/[slug]">
) {
  const { slug } = await props.params
  const section = getLibrarySection(slug)
  if (!section) notFound()

  const snippet = `import { ${section.name} } from "${section.importPath}"\n\n${section.usage}`

  return (
    <main className="min-h-full bg-neutral-100 py-8 md:py-12">
      <PageContainer className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href="/library" />}
            className="self-start"
          >
            <ArrowLeftIcon data-icon="inline-start" aria-hidden />
            Toutes les lames
          </Button>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex max-w-2xl flex-col gap-2">
              <div className="flex items-center gap-3">
                <h1 className="text-h1">{section.name}</h1>
                <Badge variant="secondary">{section.category}</Badge>
              </div>
              <p className="text-body text-muted-foreground">
                {section.description}
              </p>
            </div>
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <a href={section.example} target="_blank" rel="noreferrer" />
              }
            >
              Ouvrir en plein écran
              <ExternalLinkIcon data-icon="inline-end" aria-hidden />
            </Button>
          </div>
        </div>

        <SectionPreview src={section.example} title={section.name} />

        <section aria-labelledby="usage" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="usage" className="text-h2">
              Utilisation
            </h2>
            <CopyButton value={snippet} />
          </div>
          <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-6 font-mono text-body text-neutral-0">
            <code>{snippet}</code>
          </pre>
        </section>
      </PageContainer>
    </main>
  )
}
