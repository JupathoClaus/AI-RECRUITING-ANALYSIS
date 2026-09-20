"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useNotificationStore } from "@/store/notification-store"
import {
  Category,
  Briefcase,
  DocumentText,
  People,
  Routing2,
  Calendar,
  MagicStar,
  Video,
  Chart,
  Building,
  Notification,
  Setting2,
  MessageQuestion,
  Logout,
  Menu,
  ArrowLeft2,
  ArrowRight2,
  type Icon as IcIcon,
} from "iconsax-react"

// ─── Width constants — single source of truth consumed by AppLayout ───────────
export const SIDEBAR_W_EXPANDED = 260
export const SIDEBAR_W_COLLAPSED = 68

// ─── Navigation definition ────────────────────────────────────────────────────

interface NavItem {
  label: string
  href: string
  icon: IcIcon
  matchPrefixes?: string[]
  badge?: "notifications"
}

interface NavSection {
  id: string
  title: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    id: "main",
    title: "Main Menu",
    items: [
      { label: "Dashboard",      href: "/dashboard",     icon: Category,      matchPrefixes: ["/dashboard"] },
      { label: "Jobs",           href: "/jobs",          icon: Briefcase,     matchPrefixes: ["/jobs"] },
      { label: "Applications",   href: "/applications",  icon: DocumentText,  matchPrefixes: ["/applications"] },
      { label: "Candidates",     href: "/candidates",    icon: People,        matchPrefixes: ["/candidates"] },
      { label: "Pipeline",       href: "/pipeline",      icon: Routing2,      matchPrefixes: ["/pipeline"] },
      { label: "Interviews",     href: "/interviews",    icon: Calendar,      matchPrefixes: ["/interviews"] },
      { label: "AI Screener",    href: "/ai-screener",   icon: MagicStar,     matchPrefixes: ["/ai-screener"] },
      { label: "AI Interviews",  href: "/ai-interviews", icon: Video,         matchPrefixes: ["/ai-interviews"] },
      { label: "Reports",        href: "/reports",       icon: Chart,         matchPrefixes: ["/reports"] },
    ],
  },
  {
    id: "org",
    title: "Organization",
    items: [
      { label: "Company",        href: "/company",       icon: Building,      matchPrefixes: ["/company"] },
      {
        label: "Notifications",
        href: "/notifications",
        icon: Notification,
        matchPrefixes: ["/notifications"],
        badge: "notifications",
      },
      { label: "Settings",       href: "/settings",      icon: Setting2,      matchPrefixes: ["/settings"] },
    ],
  },
]

// ─── Helper: is a nav item active for current path ────────────────────────────
function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.matchPrefixes) {
    return item.matchPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
    )
  }
  return pathname === item.href
}

// ─── Tooltip wrapper for collapsed items ──────────────────────────────────────
function NavTooltip({
  label,
  children,
  show,
}: {
  label: string
  children: React.ReactNode
  show: boolean
}) {
  const [visible, setVisible] = React.useState(false)

  if (!show) return <>{children}</>

  return (
    <div
      className="relative"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-[200] ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#1e1e24] px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
        >
          {label}
          {/* Arrow */}
          <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#1e1e24]" />
        </div>
      )}
    </div>
  )
}

// ─── Sidebar props (shared with AppLayout) ────────────────────────────────────
export interface SidebarProps {
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
}

// ─── Component ────────────────────────────────────────────────────────────────
export function Sidebar({ collapsed, onCollapsedChange }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const fetchUnreadCount = useNotificationStore((s) => s.fetchUnreadCount)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  // Fetch notification count on mount
  React.useEffect(() => {
    fetchUnreadCount()
  }, [fetchUnreadCount])

  // Lock body scroll when mobile drawer open
  React.useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [mobileOpen])

  // Close drawer on Escape
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && mobileOpen) setMobileOpen(false) }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [mobileOpen])

  // Close drawer on route change (mobile)
  React.useEffect(() => { setMobileOpen(false) }, [pathname])

  const compact = collapsed && !mobileOpen

  const handleLogout = () => {
    logout()
    router.push("/login")
  }

  const userInitials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U"

  const formatRole = (role: string) =>
    role
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ")

  // ── Inner sidebar content (shared between mobile drawer and desktop) ────────
  const sidebarContent = (
    <div
      className="flex h-full flex-col"
      style={{ background: "var(--sidebar-bg)" }}
    >
      {/* ── Brand header ─────────────────────────────────────────────────── */}
      <div
        className={cn(
          "relative flex shrink-0 items-center",
          compact ? "h-[60px] justify-center px-0" : "h-auto min-h-[68px] px-4 py-3",
        )}
        style={{ borderBottom: "1px solid var(--sidebar-divider)" }}
      >
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-lg",
            compact && "justify-center",
          )}
          aria-label="TalentAI — go to dashboard"
        >
          {/* Brand icon */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/10">
            <img
              src="/ai-recruiter-logo.png"
              alt=""
              aria-hidden="true"
              className="h-5 w-5 object-contain brightness-0 invert"
              onError={(e) => {
                // Fallback to text mark if logo fails
                ;(e.currentTarget as HTMLImageElement).style.display = "none"
              }}
            />
          </div>
          {!compact && (
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-tight tracking-tight" style={{ color: "var(--sidebar-text)" }}>
                TalentAI
              </p>
              <p className="text-[10px] leading-tight" style={{ color: "var(--sidebar-text-muted)" }}>
                AI-Powered Recruitment
              </p>
            </div>
          )}
        </Link>

        {/* Desktop: collapse toggle — shown bottom-right of brand */}
        {!mobileOpen && (
          <button
            className={cn(
              "hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 items-center justify-center rounded-md transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
            )}
            style={{ color: "var(--sidebar-text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sidebar-hover-bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            onClick={() => onCollapsedChange(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed
              ? <ArrowRight2 size={12} />
              : <ArrowLeft2 size={12} />
            }
          </button>
        )}

        {/* Mobile: close button */}
        {mobileOpen && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md lg:hidden"
            style={{ color: "var(--sidebar-text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sidebar-hover-bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <ArrowLeft2 size={14} />
          </button>
        )}
      </div>

      {/* ── Minimize row (desktop expanded only) ─────────────────────────── */}
      {!compact && (
        <div
          className="hidden lg:flex shrink-0 items-center justify-end px-4 py-2"
          style={{ borderBottom: "1px solid var(--sidebar-divider)" }}
        >
          <button
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            style={{ color: "var(--sidebar-text-muted)" }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background = "var(--sidebar-hover-bg)"
              ;(e.currentTarget as HTMLButtonElement).style.color = "var(--sidebar-text)"
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background = "transparent"
              ;(e.currentTarget as HTMLButtonElement).style.color = "var(--sidebar-text-muted)"
            }}
            onClick={() => onCollapsedChange(true)}
            aria-label="Collapse sidebar"
          >
            <ArrowLeft2 size={11} />
            <span>Minimize</span>
          </button>
        </div>
      )}

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <nav
        className="flex-1 overflow-y-auto overflow-x-hidden py-3"
        role="navigation"
        aria-label="Main navigation"
        style={{ scrollbarWidth: "none" }}
      >
        {NAV_SECTIONS.map((section, sectionIdx) => (
          <div key={section.id} className={cn(sectionIdx > 0 && "mt-1")}>
            {/* Section divider */}
            {sectionIdx > 0 && (
              <div
                className="mx-3 my-2"
                style={{ height: "1px", background: "var(--sidebar-divider)" }}
                aria-hidden="true"
              />
            )}

            {/* Section label */}
            {!compact && (
              <p
                className="mb-1 mt-1 px-4 text-[9.5px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: "var(--sidebar-text-section)" }}
              >
                {section.title}
              </p>
            )}

            <div className="space-y-[2px] px-2">
              {section.items.map((item) => {
                const active = isNavActive(item, pathname)
                const badge = item.badge === "notifications" && unreadCount > 0 ? unreadCount : 0

                return (
                  <NavTooltip key={item.href} label={item.label} show={compact}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium outline-none transition-colors duration-150",
                        "focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent",
                        compact && "justify-center px-0",
                      )}
                      style={{
                        background: active ? "var(--sidebar-active-bg)" : "transparent",
                        color: active ? "var(--sidebar-active-text)" : "var(--sidebar-text-muted)",
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = "var(--sidebar-hover-bg)"
                          e.currentTarget.style.color = "var(--sidebar-text)"
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = "transparent"
                          e.currentTarget.style.color = "var(--sidebar-text-muted)"
                        }
                      }}
                      aria-current={active ? "page" : undefined}
                    >
                      <item.icon
                        size={17}
                        variant={active ? "Bold" : "Linear"}
                        className="shrink-0"
                        style={{ color: active ? "var(--sidebar-active-text)" : "var(--sidebar-icon)" }}
                      />

                      {!compact && (
                        <span className="flex-1 truncate leading-none">{item.label}</span>
                      )}

                      {/* Notification badge */}
                      {badge > 0 && (
                        <span
                          className={cn(
                            "flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums leading-none",
                            compact && "absolute -top-0.5 -right-0.5",
                          )}
                          style={{
                            background: "var(--sidebar-badge-bg)",
                            color: "var(--sidebar-badge-text)",
                          }}
                          aria-label={`${badge} unread notifications`}
                        >
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </Link>
                  </NavTooltip>
                )
              })}
            </div>
          </div>
        ))}

        {/* ── Help & Support + Logout ────────────────────────────────────── */}
        <div className="mt-1">
          <div
            className="mx-3 my-2"
            style={{ height: "1px", background: "var(--sidebar-divider)" }}
            aria-hidden="true"
          />

          <div className="space-y-[2px] px-2">
            <NavTooltip label="Help & Support" show={compact}>
              <Link
                href="/help"
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium outline-none transition-colors duration-150",
                  "focus-visible:ring-2 focus-visible:ring-white/30",
                  compact && "justify-center px-0",
                )}
                style={{ color: "var(--sidebar-text-muted)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--sidebar-hover-bg)"
                  e.currentTarget.style.color = "var(--sidebar-text)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent"
                  e.currentTarget.style.color = "var(--sidebar-text-muted)"
                }}
              >
                <MessageQuestion
                  size={17}
                  variant="Linear"
                  className="shrink-0"
                  style={{ color: "var(--sidebar-icon)" }}
                />
                {!compact && <span className="flex-1 truncate leading-none">Help & Support</span>}
              </Link>
            </NavTooltip>

            <NavTooltip label="Sign out" show={compact}>
              <button
                type="button"
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium outline-none transition-colors duration-150",
                  "focus-visible:ring-2 focus-visible:ring-white/30",
                  compact && "justify-center px-0",
                )}
                style={{ color: "var(--sidebar-text-muted)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--sidebar-hover-bg)"
                  e.currentTarget.style.color = "var(--sidebar-text)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent"
                  e.currentTarget.style.color = "var(--sidebar-text-muted)"
                }}
                onClick={handleLogout}
                aria-label="Sign out"
              >
                <Logout
                  size={17}
                  variant="Linear"
                  className="shrink-0"
                  style={{ color: "var(--sidebar-icon)" }}
                />
                {!compact && <span className="flex-1 text-left truncate leading-none">Sign Out</span>}
              </button>
            </NavTooltip>
          </div>
        </div>
      </nav>

      {/* ── User profile footer ──────────────────────────────────────────── */}
      <div
        className="shrink-0 px-2 pb-3 pt-2"
        style={{ borderTop: "1px solid var(--sidebar-divider)" }}
      >
        <NavTooltip label={user?.name ?? "Profile"} show={compact}>
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors duration-150 outline-none",
              "focus-visible:ring-2 focus-visible:ring-white/30",
              compact && "justify-center",
            )}
            style={{ color: "var(--sidebar-text)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sidebar-hover-bg)" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
            aria-label="Account settings"
          >
            <div className="shrink-0">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                style={{ background: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.9)" }}
                aria-hidden="true"
              >
                {userInitials}
              </div>
            </div>
            {!compact && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[12px] font-medium leading-tight" style={{ color: "var(--sidebar-text)" }}>
                    {user?.name || "User"}
                  </p>
                  <p className="truncate text-[10px] leading-tight" style={{ color: "var(--sidebar-text-muted)" }}>
                    {user?.role ? formatRole(user.role) : "Member"}
                  </p>
                </div>
                <ArrowRight2 size={13} className="shrink-0" style={{ color: "var(--sidebar-text-muted)" }} />
              </>
            )}
          </Link>
        </NavTooltip>
      </div>
    </div>
  )

  return (
    <>
      {/* ── Mobile hamburger ─────────────────────────────────────────────── */}
      <button
        type="button"
        className="fixed left-3 top-[13px] z-50 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface shadow-sm transition-colors duration-150 hover:bg-surface-hover active:bg-surface-active lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
        aria-expanded={mobileOpen}
        aria-controls="sidebar-nav"
      >
        <Menu size={18} className="text-foreground" />
      </button>

      {/* ── Mobile backdrop ───────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Desktop sidebar ───────────────────────────────────────────────── */}
      <aside
        id="sidebar-nav"
        aria-label="Main navigation"
        className={cn(
          "fixed left-0 top-0 z-50 hidden h-full transition-[width] duration-300 lg:block",
          compact ? `w-[${SIDEBAR_W_COLLAPSED}px]` : `w-[${SIDEBAR_W_EXPANDED}px]`,
        )}
        style={{
          width: compact ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED,
          background: "var(--sidebar-bg)",
          borderRight: "1px solid var(--sidebar-border)",
        }}
      >
        {sidebarContent}
      </aside>

      {/* ── Mobile drawer ─────────────────────────────────────────────────── */}
      <aside
        id="sidebar-nav-mobile"
        aria-label="Main navigation"
        aria-hidden={!mobileOpen}
        className={cn(
          "fixed left-0 top-0 z-50 h-full transition-transform duration-300 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{
          width: SIDEBAR_W_EXPANDED,
          background: "var(--sidebar-bg)",
          borderRight: "1px solid var(--sidebar-border)",
        }}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
