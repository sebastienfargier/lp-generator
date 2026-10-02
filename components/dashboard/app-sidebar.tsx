"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Check, ChevronsUpDown } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

import { currentUser, currentWorkspace, navItems } from "./dashboard-data"
import { GlobalSearch } from "./global-search"

function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("size-7 text-brand-green", className)}>
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <g transform="translate(7.25 7.23) scale(0.1539)">
        <path d="M113.732 0L0 39.0341L74.6984 114.013L113.732 0Z" className="fill-neutral-0" />
      </g>
    </svg>
  )
}

function SidebarBrand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-3 rounded-md px-1 py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <BrandMark />
      <span className="truncate text-body font-semibold group-data-[collapsible=icon]:hidden">Studi Generator</span>
    </Link>
  )
}

function WorkspaceSwitcher() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Changer d'espace de travail"
        className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-2 text-left shadow-xs transition-colors outline-none group-data-[collapsible=icon]:hidden hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-green text-caption text-neutral-0">
          {currentWorkspace.initials}
        </span>
        <span className="min-w-0 flex-1 truncate text-body font-medium">{currentWorkspace.name}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Espaces de travail</DropdownMenuLabel>
          <DropdownMenuItem>
            <span className="flex size-5 items-center justify-center rounded-sm bg-brand-green text-caption text-neutral-0">
              {currentWorkspace.initials}
            </span>
            {currentWorkspace.name}
            <Check className="ml-auto" aria-hidden />
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Actif sur la page elle-même et sur ses sous-pages (/library/<lame>). */
function isActive(pathname: string, href?: string) {
  if (!href) return false
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
}

function SidebarNav({ pathname }: { pathname: string }) {
  return (
    <SidebarGroup className="px-3">
      <SidebarGroupContent>
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              {item.href ? (
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={isActive(pathname, item.href)}
                  render={<Link href={item.href} />}
                >
                  <item.icon aria-hidden />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              ) : (
                // Intitulé de groupe : pas de page, donc pas de lien.
                <SidebarMenuButton tooltip={item.title} render={<div />} className="cursor-default">
                  <item.icon aria-hidden />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              )}
              {item.children ? (
                <SidebarMenuSub>
                  {item.children.map((child) => (
                    <SidebarMenuSubItem key={child.title}>
                      <SidebarMenuSubButton
                        isActive={isActive(pathname, child.href)}
                        render={child.href ? <Link href={child.href} /> : <div aria-disabled />}
                        className={child.href ? undefined : "cursor-default opacity-60"}
                      >
                        <child.icon aria-hidden />
                        <span>{child.title}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              ) : null}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function SidebarUser() {
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="data-popup-open:bg-sidebar-accent" />}
          >
            <Avatar className="size-8 rounded-lg">
              <AvatarFallback className="rounded-lg">{currentUser.initials}</AvatarFallback>
            </Avatar>
            <span className="truncate font-medium">{currentUser.name}</span>
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">Ouvrir le menu utilisateur</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" side={isMobile ? "bottom" : "right"} align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col gap-1 py-2">
                <span className="text-body font-medium text-foreground">{currentUser.name}</span>
                <span className="font-normal">{currentUser.email}</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      className="md:p-8 md:group-data-[collapsible=icon]:p-2"
      {...props}
    >
      <SidebarHeader className="gap-3 p-3">
        <div className="flex items-center justify-between gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
          <SidebarBrand />
          <SidebarTrigger className="hidden shrink-0 md:inline-flex" />
        </div>
        <WorkspaceSwitcher />
        <GlobalSearch />
      </SidebarHeader>
      <SidebarContent>
        <SidebarNav pathname={pathname} />
      </SidebarContent>
      <SidebarFooter className="p-3">
        <SidebarUser />
      </SidebarFooter>
    </Sidebar>
  )
}
