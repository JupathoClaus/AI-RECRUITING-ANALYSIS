"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  LayoutDashboard,
  Briefcase,
  Users,
  GitBranch,
  Calendar,
  BarChart3,
  Settings,
  Bell,
  Search,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Sparkles,
  FileText,
  MessageSquare,
  Building2,
  Menu,
  X,
} from "lucide-react"

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string; size?: number }>
  badge?: number
}

interface NavSection {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    title: "Recruitment",
    items: [
      { label: "Jobs", href: "/jobs", icon: Briefcase, badge: 12 },
      { label: "Candidates", href: "/candidates", icon: Users, badge: 48 },
      { label: "Pipeline", href: "/pipeline", icon: GitBranch },
      { label: "Interviews", href: "/interviews", icon: Calendar, badge: 5 },
    ],
  },
  {
    title: "AI Tools",
    items: [
      { label: "AI Screener", href: "/ai-screener", icon: Sparkles },
      { label: "AI Interviews", href: "/ai-interviews", icon: MessageSquare },
      { label: "Reports", href: "/reports", icon: FileText },
    ],
  },
  {
    title: "Organization",
    items: [
      { label: "Company", href: "/company", icon: Building2 },
      { label: "Notifications", href: "/notifications", icon: Bell, badge: 3 },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  const handleLogout = () => {
    logout()
    router.push("/login")
  }

  const userInitials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("")
    : "U"

  React.useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [mobileOpen])

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileOpen) {
        setMobileOpen(false)
      }
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [mobileOpen])

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-3 left-3 z-50 flex h-10 w-10 items-center justify-center rounded-xl bg-surface border border-border shadow-sm lg:hidden transition-colors duration-150 hover:bg-surface-hover active:bg-surface-active"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
        aria-expanded={mobileOpen}
      >
        <Menu className="text-foreground" size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity duration-300"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-full border-r border-border bg-surface transition-all duration-300 flex flex-col",
          collapsed ? "w-[68px]" : "w-[260px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        aria-label="Main navigation"
      >
        {/* Logo Header */}
        <div className={cn("flex items-center justify-center shrink-0 border-b border-border relative", collapsed ? "px-2 py-2" : "px-4 py-3")}>
          <Link href="/dashboard" className="flex items-center justify-center" onClick={() => setMobileOpen(false)}>
            <div className="flex h-[100px] w-[100px] items-center justify-center overflow-hidden">
              <img src="/ai-recruiter-logo.png" alt="AI Recruiter" className="h-full w-full object-contain" />
            </div>
          </Link>
          {/* Desktop collapse toggle */}
          <button
            className="absolute top-3 right-3 hidden lg:flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-hover transition-colors duration-150"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          {/* Mobile close */}
          <button
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-hover lg:hidden transition-colors duration-150"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X className="text-muted" size={16} />
          </button>
        </div>

        {/* Search */}
        {!collapsed && (
          <div className="px-3 py-3 hidden lg:block">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-muted cursor-pointer hover:border-primary/30 transition-all duration-150">
              <Search size={16} />
              <span>Search...</span>
              <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded-md border border-border bg-surface px-1.5 font-mono text-[10px] font-medium text-muted">
                ⌘K
              </kbd>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-6" role="navigation">
          {navSections.map((section) => (
            <div key={section.title}>
              {!collapsed && (
                <p className="mb-3 px-3 text-[11px] font-normal uppercase tracking-widest text-foreground">
                  {section.title}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-normal transition-all duration-150",
                        isActive
                          ? "bg-primary/10 text-primary shadow-sm"
                          : "text-foreground hover:bg-surface-hover hover:text-foreground",
                        collapsed && "justify-center px-2"
                      )}
                      title={collapsed ? item.label : undefined}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
                      )}
                      <item.icon className={cn("shrink-0", isActive ? "text-primary" : "text-foreground group-hover:text-foreground")} size={22} />
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          {item.badge && (
                            <Badge variant={isActive ? "default" : "secondary"} className="h-5 px-1.5 text-[10px] font-normal">
                              {item.badge}
                            </Badge>
                          )}
                        </>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User section */}
        <div className={cn("border-t border-border p-3 shrink-0", collapsed && "px-2")}>
          <div className={cn("flex items-center gap-3 rounded-lg p-2 hover:bg-surface-hover transition-colors duration-150", collapsed && "justify-center")}>
            <Avatar className="h-8 w-8" fallback={userInitials}>
              <AvatarImage src="/avatars/sarah.jpg" alt={user?.name || "User"} />
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-normal text-foreground truncate">{user?.name || "User"}</p>
                <p className="text-xs text-muted truncate">{user?.role || "Member"}</p>
              </div>
            )}
            {!collapsed && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleLogout} title="Sign out">
                <LogOut className="text-muted" size={16} />
              </Button>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
