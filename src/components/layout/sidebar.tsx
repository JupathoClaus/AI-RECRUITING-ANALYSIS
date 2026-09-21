"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
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
  TrendUp,
  Setting2,
  MessageQuestion,
  Logout,
  Menu,
  ArrowDown2,
  ArrowLeft2,
  ArrowRight2,
  type Icon as IcIcon,
} from "iconsax-react"

// ─── Width constants — single source of truth consumed by AppLayout ───────────
export const SIDEBAR_W_EXPANDED = 260
export const SIDEBAR_W_COLLAPSED = 68

// ─── Navigation definition ────────────────────────────────────────────────────
// Phase 1 IA: CAPABILITY ≠ NAVIGATION ITEM. Top level = modes of work
// (Dashboard / Hiring / Interviews / Reports) plus one Organization item
// (Settings). Everything else lives inside an expandable group or a workspace.

interface NavLinkItem {
  kind: "link"
  label: string
  href: string
  icon: IcIcon
  matchPrefixes?: string[]
}

interface NavGroupItem {
  kind: "group"
  label: string
  /** Destination when the group label is clicked (or when collapsed). */
  href: string
  icon: IcIcon
  children: NavLinkItem[]
}

type NavEntry = NavLinkItem | NavGroupItem

interface NavSection {
  id: string
  title: string
  items: NavEntry[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    id: "main",
    title: "Main Menu",
    items: [
      { kind: "link", label: "Dashboard", href: "/dashboard", icon: Category, matchPrefixes: ["/dashboard"] },
      {
        kind: "group",
        label: "Hiring",
        href: "/hiring",
        icon: Briefcase,
        children: [
          { kind: "link", label: "Jobs",         href: "/jobs",          icon: Briefcase,     matchPrefixes: ["/jobs"] },
          { kind: "link", label: "Applications", href: "/applications",  icon: DocumentText,  matchPrefixes: ["/applications"] },
          { kind: "link", label: "Candidates",   href: "/candidates",    icon: People,        matchPrefixes: ["/candidates"] },
          { kind: "link", label: "Pipeline",     href: "/pipeline",      icon: Routing2,      matchPrefixes: ["/pipeline"] },
        ],
      },
      {
        kind: "group",
        label: "Interviews",
        href: "/interviews",
        icon: Calendar,
        children: [
          { kind: "link", label: "Human Interviews", href: "/interviews",    icon: Calendar, matchPrefixes: ["/interviews"] },
          { kind: "link", label: "AI Interviews",    href: "/ai-interviews", icon: Video,    matchPrefixes: ["/ai-interviews"] },
        ],
      },
      {
        kind: "group",
        label: "Reports",
        href: "/reports",
        icon: Chart,
        children: [
          { kind: "link", label: "Recruitment Reports", href: "/reports",   icon: Chart,   matchPrefixes: ["/reports"] },
          { kind: "link", label: "Pipeline Analytics",  href: "/analytics", icon: TrendUp, matchPrefixes: ["/analytics"] },
        ],
      },
    ],
  },
  {
    id: "org",
    title: "Organization",
    items: [
      { kind: "link", label: "Settings", href: "/settings", icon: Setting2, matchPrefixes: ["/settings"] },
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isNavActive(item: NavLinkItem, pathname: string): boolean {
  if (item.matchPrefixes) {
    return item.matchPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
    )
  }
  return pathname === item.href
}

/** The single child of a group that matches the current route, if any. */
function activeChildOf(group: NavGroupItem, pathname: string): NavLinkItem | undefined {
  return group.children.find((child) => isNavActive(child, pathname))
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
  const [mobileOpen, setMobileOpen] = React.useState(false)
  // Manual expand/collapse per group. A group with an active child is always
  // rendered open regardless of manual state, so the active route stays visible.
  const [groupedOpen, setGroupedOpen] = React.useState<Record<string, boolean>>({})

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
        className="flex-1 overflow-y-auto overflow-x-hidden py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/30"
        role="navigation"
        aria-label="Main navigation"
        tabIndex={0}
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
              {section.items.map((entry) => {
                if (entry.kind === "link") {
                  const active = isNavActive(entry, pathname)
                  return (
                    <NavTooltip key={entry.href} label={entry.label} show={compact}>
                      <Link
                        href={entry.href}
                        aria-label={compact ? entry.label : undefined}
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
                        <entry.icon
                          size={17}
                          variant={active ? "Bold" : "Linear"}
                          className="shrink-0"
                          style={{ color: active ? "var(--sidebar-active-text)" : "var(--sidebar-icon)" }}
                        />
                        {!compact && <span className="flex-1 truncate leading-none">{entry.label}</span>}
                      </Link>
                    </NavTooltip>
                  )
                }

                // ── Expandable group (Hiring / Interviews / Reports) ──────
                const childActive = activeChildOf(entry, pathname)
                const open = childActive ? true : (groupedOpen[entry.label] ?? false)
                const groupActive = pathname === entry.href
                const highlighted = groupActive || !!childActive

                return (
                  <div key={entry.label}>
                    <div
                      className={cn(
                        "flex items-center rounded-lg transition-colors duration-150",
                        !compact && "gap-1 pl-1 pr-1",
                      )}
                      style={{
                        background: highlighted ? "var(--sidebar-active-bg)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!highlighted) (e.currentTarget as HTMLDivElement).style.background = "var(--sidebar-hover-bg)"
                      }}
                      onMouseLeave={(e) => {
                        if (!highlighted) (e.currentTarget as HTMLDivElement).style.background = "transparent"
                      }}
                    >
                      <NavTooltip label={entry.label} show={compact}>
                        <Link
                          href={entry.href}
                          aria-label={compact ? entry.label : undefined}
                          className={cn(
                            "flex flex-1 items-center gap-2.5 rounded-lg px-1.5 py-2 text-[13px] font-medium outline-none transition-colors duration-150",
                            "focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent",
                            compact && "justify-center px-1",
                          )}
                          style={{
                            color: highlighted ? "var(--sidebar-active-text)" : "var(--sidebar-text-muted)",
                          }}
                          onMouseEnter={(e) => {
                            if (!highlighted) (e.currentTarget as HTMLAnchorElement).style.color = "var(--sidebar-text)"
                          }}
                          onMouseLeave={(e) => {
                            if (!highlighted) (e.currentTarget as HTMLAnchorElement).style.color = "var(--sidebar-text-muted)"
                          }}
                          aria-current={groupActive ? "page" : undefined}
                        >
                          <entry.icon
                            size={17}
                            variant={highlighted ? "Bold" : "Linear"}
                            className="shrink-0"
                            style={{ color: highlighted ? "var(--sidebar-active-text)" : "var(--sidebar-icon)" }}
                          />
                          {!compact && <span className="flex-1 truncate leading-none">{entry.label}</span>}
                        </Link>
                      </NavTooltip>

                      {!compact && !childActive && (
                        <button
                          type="button"
                          onClick={() =>
                            setGroupedOpen((prev) => ({ ...prev, [entry.label]: !(prev[entry.label] ?? false) }))
                          }
                          aria-expanded={open}
                          aria-controls={`nav-group-${entry.label.toLowerCase()}`}
                          aria-label={`${open ? "Collapse" : "Expand"} ${entry.label}`}
                          className="flex h-7 w-6 shrink-0 items-center justify-center rounded-md outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white/30"
                          style={{ color: "var(--sidebar-text-muted)" }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = "var(--sidebar-hover-bg)"
                            ;(e.currentTarget as HTMLButtonElement).style.color = "var(--sidebar-text)"
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = "transparent"
                            ;(e.currentTarget as HTMLButtonElement).style.color = "var(--sidebar-text-muted)"
                          }}
                        >
                          <ArrowDown2
                            size={14}
                            className={cn("transition-transform duration-150", open && "rotate-180")}
                          />
                        </button>
                      )}
                    </div>

                    {open && !compact && (
                      <div
                        id={`nav-group-${entry.label.toLowerCase()}`}
                        role="group"
                        aria-label={entry.label}
                        className="ml-[15px] mt-1 space-y-[2px] border-l pl-2"
                        style={{ borderColor: "var(--sidebar-divider)" }}
                      >
                        {entry.children.map((child) => {
                          const active = isNavActive(child, pathname)
                          return (
                            <NavTooltip key={child.href} label={child.label} show={false}>
                              <Link
                                href={child.href}
                                className={cn(
                                  "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-normal outline-none transition-colors duration-150",
                                  "focus-visible:ring-2 focus-visible:ring-white/30",
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
                                <child.icon
                                  size={15}
                                  variant={active ? "Bold" : "Linear"}
                                  className="shrink-0"
                                  style={{ color: active ? "var(--sidebar-active-text)" : "var(--sidebar-icon)" }}
                                />
                                <span className="flex-1 truncate leading-none">{child.label}</span>
                              </Link>
                            </NavTooltip>
                          )
                        })}
                      </div>
                    )}
                  </div>
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
                style={{
                  color: pathname === "/help" ? "var(--sidebar-active-text)" : "var(--sidebar-text-muted)",
                }}
                onMouseEnter={(e) => {
                  if (pathname !== "/help") {
                    e.currentTarget.style.background = "var(--sidebar-hover-bg)"
                    e.currentTarget.style.color = "var(--sidebar-text)"
                  }
                }}
                onMouseLeave={(e) => {
                  if (pathname !== "/help") {
                    e.currentTarget.style.background = "transparent"
                    e.currentTarget.style.color = "var(--sidebar-text-muted)"
                  }
                }}
                aria-label={compact ? "Help & Support" : undefined}
                aria-current={pathname === "/help" ? "page" : undefined}
              >
                <MessageQuestion
                  size={17}
                  variant={pathname === "/help" ? "Bold" : "Linear"}
                  className="shrink-0"
                  style={{
                    color: pathname === "/help" ? "var(--sidebar-active-text)" : "var(--sidebar-icon)",
                  }}
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
