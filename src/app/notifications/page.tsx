"use client"

import { useState, useEffect, useMemo, useCallback, useReducer } from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Notification,
  TickCircle,
  Document,
  Calendar,
  Gift,
  UserAdd,
  UserRemove,
  Cpu,
  MessageSquare,
  Setting,
  MoreCircle,
} from "iconsax-react"
import { cn, timeAgo, getErrorMessage } from "@/lib/utils"
import * as notificationsApi from "@/lib/api/notifications.api"
import type { NotificationResponse } from "@/lib/api/notifications.api"

type NotificationType = "application" | "interview" | "offer" | "hire" | "rejection" | "ai" | "note" | "invitation" | "system"

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

const typeIconMap: Record<NotificationType, typeof Notification> = {
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
  application: "bg-blue-500/15 text-blue-400",
  interview: "bg-purple-500/15 text-purple-400",
  offer: "bg-amber-500/15 text-amber-400",
  hire: "bg-emerald-500/15 text-emerald-400",
  rejection: "bg-red-500/15 text-red-400",
  ai: "bg-indigo-500/15 text-indigo-400",
  note: "bg-cyan-500/15 text-cyan-400",
  invitation: "bg-green-500/15 text-green-400",
  system: "bg-gray-500/15 text-gray-400",
}

function getDateGroup(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0 && now.getDate() === date.getDate()) return "Today"
  if (days < 2 || (days === 1 && now.getDate() - date.getDate() === 1)) return "Yesterday"
  if (days < 7) return "This Week"
  return "Earlier"
}

function groupByDate(items: NotificationResponse[]): Record<string, NotificationResponse[]> {
  const groups: Record<string, NotificationResponse[]> = {}
  for (const n of items) {
    const key = getDateGroup(new Date(n.createdAt))
    if (!groups[key]) groups[key] = []
    groups[key].push(n)
  }
  return groups
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationResponse[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [pageMeta, dispatchPageMeta] = useReducer(
    (state: { loading: boolean; error: string | null }, action: { type: "loading" } | { type: "error"; error: string } | { type: "done" }) => {
      switch (action.type) {
        case "loading": return { loading: true, error: null }
        case "error": return { loading: false, error: action.error }
        case "done": return { loading: false, error: null }
      }
    },
    { loading: true, error: null }
  )
  const [tab, setTab] = useState("all")
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [markAllLoading, setMarkAllLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    dispatchPageMeta({ type: "loading" })
    Promise.all([
      notificationsApi.getNotifications({ limit: 50 }),
      notificationsApi.getUnreadCount(),
    ]).then(([notifRes, unreadRes]) => {
      if (cancelled) return
      setNotifications(notifRes.items)
      setUnreadCount(unreadRes.count)
      dispatchPageMeta({ type: "done" })
    }).catch((err: unknown) => {
      if (cancelled) return
      dispatchPageMeta({ type: "error", error: getErrorMessage(err, "Failed to load notifications") })
    })
    return () => { cancelled = true }
  }, [])

  const handleMarkRead = useCallback(async (id: string) => {
    setActionLoading(id)
    try {
      await notificationsApi.markNotificationRead(id)
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (err: unknown) {
      dispatchPageMeta({ type: "error", error: getErrorMessage(err, "Failed to mark as read") })
    } finally {
      setActionLoading(null)
    }
  }, [])

  const handleMarkAllRead = useCallback(async () => {
    setMarkAllLoading(true)
    try {
      await notificationsApi.markAllNotificationsRead()
      setNotifications((prev) => prev.map((n) => n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
      setUnreadCount(0)
    } catch (err: unknown) {
      dispatchPageMeta({ type: "error", error: getErrorMessage(err, "Failed to mark all as read") })
    } finally {
      setMarkAllLoading(false)
    }
  }, [])

  const filtered = useMemo(() => {
    switch (tab) {
      case "unread":
        return notifications.filter((n) => !n.readAt)
      case "system":
        return notifications.filter((n) => n.type.startsWith("AI_") || n.type === "SYSTEM")
      default:
        return notifications
    }
  }, [tab, notifications])

  const grouped = groupByDate(filtered)

  return (
    <AppLayout
      title="Notifications"
      description="Stay updated on candidate activity and hiring pipeline changes"
      actions={
        <div className="flex items-center gap-1 sm:gap-3">
          <Button variant="ghost" size="sm" className="text-muted hover:text-foreground hidden sm:inline-flex" disabled title="Preferences coming soon">
            <Setting className="h-4 w-4 mr-2" />
            Preferences
          </Button>
          <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={markAllLoading || unreadCount === 0}>
            <TickCircle className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{markAllLoading ? "Marking..." : "Mark all as read"}</span>
          </Button>
        </div>
      }
    >
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between mb-6">
          <TabsList>
            <TabsTrigger value="all">
              <Notification className="mr-1.5" size={14} />
              All
              {unreadCount > 0 && (
                <Badge variant="default" className="ml-2 h-5 min-w-5 px-1.5 text-[10px] justify-center">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="unread">
              <MessageSquare className="mr-1.5" size={14} />
              Unread
            </TabsTrigger>
            <TabsTrigger value="system">
              <Cpu className="mr-1.5" size={14} />
              System
            </TabsTrigger>
          </TabsList>
        </div>

        {pageMeta.error && (
          <div className="mb-4 rounded-lg border border-error/20 bg-error/5 px-4 py-2 text-sm text-error flex items-center justify-between">
            <span>{pageMeta.error}</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => window.location.reload()}>Retry</Button>
          </div>
        )}

        {pageMeta.loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-4 p-4">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <NotificationGroups
            grouped={grouped}
            readIds={new Set(notifications.filter((n) => n.readAt).map((n) => n.id))}
            actionLoading={actionLoading}
            onMarkRead={handleMarkRead}
          />
        )}
      </Tabs>
    </AppLayout>
  )
}

function NotificationGroups({
  grouped,
  readIds,
  actionLoading,
  onMarkRead,
}: {
  grouped: Record<string, NotificationResponse[]>
  readIds: Set<string>
  actionLoading: string | null
  onMarkRead: (id: string) => void
}) {
  const groups = Object.entries(grouped)

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="h-16 w-16 rounded-full bg-surface-hover flex items-center justify-center mb-4">
          <Notification className="h-8 w-8 text-muted" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">All caught up</h3>
        <p className="text-sm text-muted max-w-sm">
          No notifications to show. Check back later for updates on your candidates.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map(([label, items]) => (
        <div key={label}>
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 px-1" suppressHydrationWarning>
            {label}
          </h3>
          <div className="rounded-xl bg-surface overflow-hidden divide-y divide-border">
            {items.map((n) => {
              const type = mapBackendType(n.type)
              const Icon = typeIconMap[type]
              const read = readIds.has(n.id)
              const loading = actionLoading === n.id
              return (
                <div
                  key={n.id}
                  onClick={() => { if (!read && !loading) onMarkRead(n.id) }}
                  className={cn(
                    "flex items-start gap-4 px-5 py-4 cursor-pointer transition-colors duration-150",
                    read
                      ? "hover:bg-surface-hover/50"
                      : "bg-primary-subtle hover:bg-primary-muted"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                      typeColorMap[type]
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs text-muted mt-0.5">{n.body}</p>
                    )}
                    <p className="text-xs text-muted mt-1" suppressHydrationWarning>{timeAgo(new Date(n.createdAt))}</p>
                  </div>
                  {!read && (
                    <div className="mt-2 flex shrink-0">
                      <MoreCircle className="h-2.5 w-2.5 fill-primary text-primary" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
