"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Sidebar, SIDEBAR_W_EXPANDED, SIDEBAR_W_COLLAPSED } from "./sidebar"
import { TopNav } from "./topnav"

interface AppLayoutProps {
  children: React.ReactNode
  title: string
  description?: string
  actions?: React.ReactNode
}

export function AppLayout({ children, title, description, actions }: AppLayoutProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)

  React.useEffect(() => {
    if (!loading && !user) {
      router.replace("/login")
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  // Sidebar width drives the content margin — single source of truth
  const contentOffset = sidebarCollapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED

  return (
    <div className="min-h-screen bg-background">
      {/* Skip-to-content link for keyboard/screen-reader users */}
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[60] rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to content
      </a>

      <Sidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />

      {/* Main content area — left offset matches sidebar width exactly */}
      <div
        className="flex min-h-screen flex-col transition-[padding-left] duration-300"
        style={{
          // Desktop: offset matches sidebar; mobile: no offset (sidebar is overlay)
          paddingLeft: undefined,
        }}
      >
        {/* The CSS approach: on lg+ use inline CSS var driven by JS state.
            On < lg the sidebar is an overlay so no padding needed. */}
        <style suppressHydrationWarning>{`
          @media (min-width: 1024px) {
            #app-content-shell {
              padding-left: ${contentOffset}px;
            }
          }
        `}</style>
        <div id="app-content-shell" className="flex min-h-screen flex-col">
          <TopNav title={title} description={description} actions={actions} />
          <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
