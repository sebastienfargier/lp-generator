import { PillarsSection, type PillarItem } from "@/components/sections/pillars"

const items: PillarItem[] = [
  {
    title: "Ship faster without breaking things",
    description:
      "Preview every change in isolation, promote with a single command, and roll back in seconds when something slips through. Zero configuration, zero waiting on infrastructure.",
  },
  {
    title: "Scale without a platform team",
    description:
      "Autoscale from a side project to a million requests a minute without tuning a single knob. The platform handles capacity, routing, and failover so your engineers can stay focused on the product.",
  },
  {
    title: "Sleep through the rollout",
    description:
      "Canary every deploy, watch the signals, and auto-pause when error rates drift. Get a digest the next morning instead of a 3 a.m. page about a bad release.",
  },
]

export default function PillarsExamplePage() {
  return (
    <main>
      <PillarsSection
        eyebrow="Three pillars"
        title="A simpler way to build production software"
        description="We stripped the platform down to the three things that actually move teams forward. Everything else is a distraction."
        items={items}
      />
    </main>
  )
}
