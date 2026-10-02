import type { Metadata } from "next"

import { tools } from "@/components/dashboard/dashboard-data"
import { PageHeader, SectionHeading } from "@/components/dashboard/page-header"
import { ResourcesCard } from "@/components/dashboard/resources-card"
import { ToolCard } from "@/components/dashboard/tool-card"

export const metadata: Metadata = { title: "Dashboard" }

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Dashboard" description="Créez vos landing pages et vos emails depuis un seul espace." />

      <section className="flex flex-col gap-4" aria-labelledby="create-heading">
        <h2 id="create-heading" className="text-h2">
          Créer
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {tools.map((tool) => (
            <ToolCard key={tool.href} {...tool} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading
          title="Ressources"
          description="Réutilisez vos lames pour construire plus rapidement vos contenus."
        />
        <ResourcesCard />
      </section>
    </div>
  )
}
