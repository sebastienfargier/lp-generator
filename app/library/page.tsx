import type { Metadata } from "next"
import Link from "next/link"

import { PageContainer } from "@/components/layout/page-container"
import {
  libraryCategories,
  libraryShellCategory,
  libraryShellNote,
  libraryShellParts,
  librarySections,
} from "@/components/library/registry"
import { GenerationStatus } from "@/components/library/generation-status"
import { SectionThumbnail } from "@/components/library/section-thumbnail"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Bibliothèque de lames",
}

export default function LibraryPage() {
  return (
    <main className="min-h-full bg-neutral-100 py-8 md:py-12">
      <PageContainer className="flex flex-col gap-12">
        <header className="flex flex-col gap-2">
          <h1 className="text-h1">Bibliothèque de lames</h1>
          <p className="text-body text-muted-foreground">
            {librarySections.length} lames prêtes à composer une landing page.
          </p>
        </header>

        {libraryCategories.map((category) => {
          const sections = librarySections.filter(
            (section) => section.category === category
          )
          if (sections.length === 0) return null

          return (
            <section key={category} className="flex flex-col gap-4">
              <h2 className="text-h2">{category}</h2>
              <ul
                role="list"
                className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
              >
                {sections.map((section) => (
                  <li key={section.slug}>
                    <Card className="relative h-full gap-4 pt-0 transition-shadow hover:shadow-lg hover:shadow-foreground/5 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 motion-reduce:transition-none">
                      <SectionThumbnail src={section.example} />
                      <CardHeader className="gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle role="heading" aria-level={3}>
                            <Link
                              href={`/library/${section.slug}`}
                              className="outline-none after:absolute after:inset-0"
                            >
                              {section.name}
                            </Link>
                          </CardTitle>
                          <Badge variant="secondary">{section.category}</Badge>
                        </div>
                        <CardDescription>{section.description}</CardDescription>
                        <div>
                          <GenerationStatus type={section.type} />
                        </div>
                      </CardHeader>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

        <section className="flex flex-col gap-4">
          <h2 className="text-h2">{libraryShellCategory}</h2>
          <ul
            role="list"
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {libraryShellParts.map((part) => (
              <li key={part.slug}>
                <Card className="relative h-full gap-4 pt-0 transition-shadow hover:shadow-lg hover:shadow-foreground/5 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 motion-reduce:transition-none">
                  <SectionThumbnail src={part.example} />
                  <CardHeader className="gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle role="heading" aria-level={3}>
                        <Link
                          href={`/library/${part.slug}`}
                          className="outline-none after:absolute after:inset-0"
                        >
                          {part.name}
                        </Link>
                      </CardTitle>
                      <Badge variant="secondary">{libraryShellCategory}</Badge>
                    </div>
                    <CardDescription>{part.description}</CardDescription>
                    <p className="text-caption text-muted-foreground">
                      {libraryShellNote}
                    </p>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      </PageContainer>
    </main>
  )
}
