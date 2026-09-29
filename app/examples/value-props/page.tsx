import { ValueProps, type ValuePropItem } from "@/components/sections/value-props"

const items: ValuePropItem[] = [
  {
    title: "Lorem ipsum dolor sit amet.",
    description:
      "Consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.",
  },
  {
    title: "Ut enim ad minim",
    description: "Quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea.",
  },
  {
    title: "Duis aute irure dolor",
    description:
      "In reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla.",
  },
  {
    title: "Excepteur sint occaecat",
    description:
      "Sunt in culpa qui officia deserunt mollit anim id est laborum sed ut.",
  },
]

export default function ValuePropsExamplePage() {
  return (
    <main>
      <ValueProps label="Nos engagements" items={items} />
    </main>
  )
}
