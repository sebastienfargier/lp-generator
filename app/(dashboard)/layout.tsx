import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

/**
 * Shell du dashboard : sidebar + contenu. Les générateurs (/generator,
 * /email-generator) et la bibliothèque gardent leur propre mise en page, plein
 * écran : ils ne passent pas par ce layout.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider style={{ "--sidebar-width": "20rem" } as React.CSSProperties}>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <div className="mx-auto w-full max-w-350 px-4 pt-4 md:hidden lg:px-8">
            <SidebarTrigger className="-ml-2" />
          </div>
          <div className="mx-auto flex w-full min-w-0 max-w-350 flex-1 flex-col px-4 py-8 lg:px-8">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
