import { CampaignSpotlight } from "@/components/sections/campaign-spotlight"
import { landingDestinationUrl } from "@/lib/landing/destinations"
import { landingImages } from "@/lib/landing/image-catalog"

const image = landingImages.find((candidate) => candidate.id === "content-4")!

export default function CampaignSpotlightExamplePage() {
  return (
    <main>
      <CampaignSpotlight
        title="Explorez les temps forts"
        accent="de Studi"
        description="Découvrez les formations Studi et avancez dans votre projet, à votre rythme."
        visual={{ src: image.src, alt: image.alt }}
        primaryAction={{
          label: "Découvrir les formations",
          href: landingDestinationUrl("catalogue-formations"),
        }}
      />
    </main>
  )
}
