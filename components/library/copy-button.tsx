"use client"

import { useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? (
        <CheckIcon data-icon="inline-start" aria-hidden />
      ) : (
        <CopyIcon data-icon="inline-start" aria-hidden />
      )}
      {copied ? "Copié" : "Copier"}
    </Button>
  )
}
