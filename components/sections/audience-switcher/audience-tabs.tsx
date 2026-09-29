"use client"

import { useState } from "react"
import Image from "next/image"
import { Tabs } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

import type { AudienceItem } from "./types"

type AudienceTabsProps = {
  items: AudienceItem[]
  defaultValue?: string
}

/**
 * Tabs de Base UI pour le comportement (rôles ARIA, flèches clavier, activation
 * au focus) ; l'apparence reste celle de blocs éditoriaux. Seul l'`id` actif est
 * stocké : l'image affichée en est dérivée.
 */
export function AudienceTabs({ items, defaultValue }: AudienceTabsProps) {
  const [activeId, setActiveId] = useState(() =>
    items.some((item) => item.id === defaultValue) ? defaultValue : items[0]?.id
  )

  return (
    <Tabs.Root
      value={activeId}
      onValueChange={(value) => setActiveId(value as string)}
      className="flex flex-col gap-8 md:gap-12"
    >
      {/* Mobile / petite tablette : défilement horizontal. ≥ 768 px : 3 colonnes. */}
      <Tabs.List
        activateOnFocus
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto [scrollbar-width:none] md:grid md:auto-cols-fr md:grid-flow-col md:gap-8 md:overflow-visible"
      >
        {items.map((item) => (
          <Tabs.Tab
            key={item.id}
            value={item.id}
            className="flex w-4/5 shrink-0 cursor-pointer snap-start flex-col gap-2 rounded-sm text-left opacity-50 outline-none transition-opacity hover:opacity-75 focus-visible:inset-ring-3 focus-visible:inset-ring-ring/50 data-active:opacity-100 motion-reduce:transition-none md:w-auto"
          >
            <span className="text-body text-foreground">{item.eyebrow}</span>
            <span className="text-h2 leading-tight text-foreground">
              {item.title}
            </span>
            <span className="text-body text-muted-foreground">
              {item.description}
            </span>
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {/*
        Tous les panneaux restent montés et superposés : les images sont
        préchargées et le changement se fait en fondu. Les panneaux inactifs
        sont retirés de l'arbre d'accessibilité (aria-hidden + inert).
      */}
      <div className="relative mx-auto aspect-4/3 w-full max-w-5xl overflow-hidden rounded-xl bg-muted sm:aspect-video">
        {items.map((item, index) => {
          const isActive = item.id === activeId
          return (
            <Tabs.Panel
              key={item.id}
              value={item.id}
              keepMounted
              render={(props) => (
                <div
                  {...props}
                  hidden={false}
                  aria-hidden={isActive ? undefined : true}
                  inert={!isActive}
                />
              )}
              className={cn(
                "absolute inset-0 transition-[opacity,scale] duration-300 outline-none motion-reduce:transition-none",
                isActive ? "scale-100 opacity-100" : "scale-102 opacity-0"
              )}
            >
              <Image
                src={item.image.src}
                alt={item.image.alt}
                fill
                preload={index === 0}
                sizes="(min-width: 1024px) 1024px, 100vw"
                className="object-cover"
              />
            </Tabs.Panel>
          )
        })}
      </div>
    </Tabs.Root>
  )
}
