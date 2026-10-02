"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

import { searchableItems } from "./dashboard-data"

/** Bouton de recherche de la sidebar + palette de commandes (⌘K / Ctrl+K). */
export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-left text-body text-muted-foreground shadow-xs transition-colors outline-none group-data-[collapsible=icon]:hidden hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">Rechercher…</span>
        <kbd className="pointer-events-none hidden h-5 shrink-0 items-center gap-1 rounded-sm border border-border bg-muted px-2 font-sans text-caption text-muted-foreground sm:inline-flex">
          ⌘ K
        </kbd>
      </button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Recherche globale"
        description="Recherchez une page de Studi Generator."
      >
        <Command>
          <CommandInput placeholder="Rechercher une page…" />
          <CommandList>
            <CommandEmpty>Aucun résultat.</CommandEmpty>
            <CommandGroup heading="Pages">
              {searchableItems.map((item) => (
                <CommandItem key={item.href} value={item.title} onSelect={() => go(item.href)}>
                  <item.icon aria-hidden />
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
