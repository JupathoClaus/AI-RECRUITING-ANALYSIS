"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { cn, timeAgo, getErrorMessage } from "@/lib/utils"
import {
  Notification,
  TickCircle,
  CloseCircle,
  Document,
  Calendar,
  Gift,
  UserAdd,
  UserRemove,
  Cpu,
  MessageSquare,
  Eye,
} from "iconsax-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import * as notificationsApi from "@/lib/api/notifications.api"
import type { NotificationResponse } from "@/lib/api/notifications.api"
import { useNotificationStore } from "@/store/notification-store"

type NotificationType =
  | "application"
  | "interview"
  | "offer"
  | "hire"
  | "rejection"
  | "ai"
  | "note"
  | "invitation"
  | "system"

function mapBackendType(type: string): NotificationType {
  if (type.startsWith("APPLICATION")) return "application"
  if (type.startsWith("INTERVIEW")) return "interview"
  if (type === "CANDIDATE_HIRED") return "hire"
  if (type === "CANDIDATE_REJECTED") return "rejection"
  if (type.startsWith("INVITATION")) return "invitation"
  if (type === "NOTE_ADDED") return "note"
  if (type.startsWith("AI_")) return "ai"
  return "system"
}

const typeIconMap: Record<NotificationType, typeof Document> = {
  application: Document,
  interview: Calendar,
  offer: Gift,
  hire: UserAdd,
  rejection: UserRemove,
  ai: Cpu,
  note: MessageSquare,
  invitation: Document,
  system: Notification,
}

const typeColorMap: Record<NotificationType, string> = {
  application: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  interview: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  offer: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  hire: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  rejection: "bg-red-500/15 text-red-600 dark:text-red-400",
  ai: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  note: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  invitation: "bg-green-500/15 text-green-600 dark:text-green-400",
  system: "bg-gray-500/15 text-gray-500 dark:text-gray-400",
}

export function NotificationDrawer() {
  const router = useRouter()
  const pathname = usePathname()
  const { unreadCount, fetchUnreadCount, decrementUnread, resetUnread } = useNotificationStore()
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState<NotificationResponse[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [markAllLoading, setMarkAllLoading] = React.useState(false)
  const [actionId, setActionId] = React.useState<string | null>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const requestSeq = React.useRef(0)

  React.useEffect(() => {
    fetchUnreadCount()
  }, [fetchUnreadCount])

  // Close when the user navigates to any route (incl. "View all" → /notifications).
  React.useEffect(() => {
    if (pathname) setOpen(false)
  }, [pathname])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    // Move focus into the panel once it is mounted.
    panelRef.current?.focus()
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open])

  const load = React.useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const res = await notificationsApi.getNotifications({ page: 1, limit: 12 })
      if (seq !== requestSeq.current) return
      setItems(res.items)
    } catch (err) {
      if (seq !== requestSeq.current) return
      setError(getErrorMessage(err, "Couldn't load notifications"))
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [])

  const handleOpen = React.useCallback(() => {
    setOpen((prev) => {
      const next = !prev
      if (next) void load()
      return next
    })
  }, [load])

  const handleActivate = React.useCallback(
    async (item: NotificationResponse) => {
      setActionId(item.id)
      try {
        if (!item.readAt) {
          await notificationsApi.markNotificationRead(item.id)
          decrementUnread()
        }
      } catch {
        // Reading state is best-effort in the drawer; navigation still happens.
      } finally {
        setActionId(null)
      }
      if (item.actionUrl) {
        router.push(item.actionUrl)
      }
      setOpen(false)
    },
    [decrementUnread, router],
  )

  const handleMarkAll = React.useCallback(async () => {
    setMarkAllLoading(true)
    try {
      await notificationsApi.markAllNotificationsRead()
      setItems((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })))
      resetUnread()
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't mark notifications as read"))
    } finally {
      setMarkAllLoading(false)
    }
  }, [resetUnread])

  return (
    <>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notification-drawer"
      >
        <Notification className="h-4 w-4" size={18} variant="Bold" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums"
            style={{
              background: "var(--sidebar-badge-bg)",
              color: "var(--sidebar-badge-text)",
            }}
            aria-label={`${unreadCount} unread notifications`}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <aside
        id="notification-drawer"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        tabIndex={-1}
        className={cn(
          "fixed right-0 top-0 z-[100] flex h-full w-[380px] max-w-[100vw] flex-col border-l border-border bg-surface shadow-xl outline-none",
          open ? "animate-slide-in-right" : "pointer-events-none opacity-0",
        )}
      >
        {open && (
        <>
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
            {unreadCount > 0 && (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--color-primary-muted)" }}>
                {unreadCount} unread
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={markAllLoading || items.length === 0}
              onClick={() => void handleMarkAll()}
            >
              <Eye className="mr-1 h-3.5 w-3.5" />
              Mark all read
            </Button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                triggerRef.current?.focus()
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close notifications"
            >
              <CloseCircle size={16} variant="Bold" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" tabIndex={0}>
          {loading && (
            <div className="space-y-3 p-2" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <Notification className="h-8 w-8 text-muted" size={32} />
              <p className="text-sm text-muted">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <TickCircle className="h-8 w-8 text-muted" size={32} />
              <p className="text-sm font-medium text-foreground">You're all caught up</p>
              <p className="text-xs text-muted">New activity will show up here.</p>
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <ul className="space-y-1">
              {items.map((item) => {
                const type = mapBackendType(item.type)
                const Icon = typeIconMap[type]
                const unread = !item.readAt
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void handleActivate(item)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150",
                        unread ? "bg-surface-elevated hover:bg-surface-hover" : "hover:bg-surface-hover",
                        actionId === item.id && "opacity-60",
                      )}
                    >
                      <span
                        className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", typeColorMap[type])}
                      >
                        <Icon className="h-4 w-4" size={16} variant="Bold" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "truncate text-[13px] font-medium",
                              unread ? "text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {item.title}
                          </span>
                          {unread && (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: "var(--color-destructive)" }}
                              aria-label="Unread"
                            />
                          )}
                        </span>
                        {item.body && (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{item.body}</span>
                        )}
                        <span className="mt-1 block text-[11px] text-muted">
                          {timeAgo(new Date(item.createdAt))}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <footer className="shrink-0 border-t border-border p-3">
          <Link
            href="/notifications"
            className="flex h-9 items-center justify-center rounded-lg bg-surface-elevated text-[13px] font-medium text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View all notifications
          </Link>
        </footer>
        </>
      )}
    </aside>
    </>
  )
}