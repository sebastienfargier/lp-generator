import type { LucideIcon } from "lucide-react"
import {
  Blocks,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  Mail,
  Palette,
  PanelsTopLeft,
} from "lucide-react"

import { librarySections } from "@/components/library/registry"
import { emailBlockManifest } from "@/lib/email/manifest"

/**
 * Données du dashboard : outils, ressources et navigation. Les destinations
 * sont celles des routes existantes ; aucune page n'est inventée. Les
 * compteurs viennent des vraies sources (registre de la bibliothèque).
 */

export const currentUser = {
  name: "Sébastien Fargier",
  email: "sebastien.fargier@studi.fr",
  initials: "SF",
}

export const currentWorkspace = {
  name: "Studi",
  initials: "ST",
}

export type Tool = {
  title: string
  description: string
  /** Libellé du bouton de la carte. */
  cta: string
  href: string
  icon: LucideIcon
}

/** Un générateur = une route. */
export const tools: Tool[] = [
  {
    title: "Landing Pages",
    description: "Décrivez votre projet : l'IA compose une landing page à partir de lames contrôlées.",
    cta: "Générer une landing page",
    href: "/generator",
    icon: PanelsTopLeft,
  },
  {
    title: "Emails",
    description: "Décrivez votre email : l'IA le compose à partir de lames contrôlées.",
    cta: "Générer un email",
    href: "/email-generator",
    icon: Mail,
  },
]

export type ResourceLibrary = {
  title: string
  description: string
  icon: LucideIcon
  /** `null` : la bibliothèque n'existe pas encore, l'entrée n'est pas un lien. */
  href: string | null
  /** `null` : pas de compteur disponible. */
  lames: number | null
}

export const resourceLibraries: ResourceLibrary[] = [
  {
    title: "Lames Landing Page",
    description: "Sections réutilisables pour vos landing pages.",
    icon: LayoutTemplate,
    href: "/library",
    lames: librarySections.length,
  },
  {
    title: "Lames Email",
    description: "Blocs réutilisables pour vos emails.",
    icon: Blocks,
    href: "/email-library",
    lames: Object.keys(emailBlockManifest).length,
  },
]

export function formatLameCount(count: number) {
  return `${count} ${count > 1 ? "lames" : "lame"}`
}

export type NavItem = {
  title: string
  /** Absent : simple intitulé de groupe, sans page. */
  href?: string
  icon: LucideIcon
  children?: { title: string; href?: string; icon: LucideIcon }[]
}

export const navItems: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Landing Pages", href: "/generator", icon: PanelsTopLeft },
  { title: "Emails", href: "/email-generator", icon: Mail },
  {
    title: "Ressources",
    icon: Library,
    children: resourceLibraries.map(({ title, href, icon }) => ({ title, href: href ?? undefined, icon })),
  },
  { title: "Design System", href: "/design-system", icon: Palette },
]

/** Pages atteignables, pour la recherche (⌘K). */
export const searchableItems = navItems
  .flatMap((item) => [item, ...(item.children ?? [])])
  .flatMap((item) => (item.href ? [{ title: item.title, href: item.href, icon: item.icon }] : []))
