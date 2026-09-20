"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  Trash,
} from "iconsax-react"
import { cn, timeAgo, getErrorMessage } from "@/lib/utils"
import * as notificationsApi from "@/lib/api/notifications.api"
import type { NotificationResponse } from "@/lib/api/notifications.api"
import { useNotificationStore } from "@/store/notification-store"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"

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
  const router = useRouter()
  const [notifications, setNotifications] = useState<NotificationResponse[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadMoreLoading, setLoadMoreLoading] = useState(false)
  const [pageLoadError, setPageLoadError] = useState<string | null>(null)
  const [pageLoadKey, setPageLoadKey] = useState(0)
  const [tab, setTab] = useState("all")
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [markAllLoading, setMarkAllLoading] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const { unreadCount, fetchUnreadCount, decrementUnread, resetUnread } = useNotificationStore()

  useEffect(() => {
    let cancelled = false
    const params: Record<string, string | number> = { page: 1, limit: 20 }
    if (tab === "unread") params.unread = "true"
    if (tab === "system") params.category = "system"
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setPageLoadError(null)
    notificationsApi.getNotifications(params).then((res) => {
      if (cancelled) return
      setNotifications(res.items)
      setTotalPages(res.meta.totalPages)
      setPage(1)
      setLoading(false)
    }).catch((err: unknown) => {
      if (cancelled) return
      setPageLoadError(getErrorMessage(err, "Failed to load notifications"))
      setLoading(false)
    })
    fetchUnreadCount()
    return () => { cancelled = true }
  }, [pageLoadKey, tab, fetchUnreadCount])

  const handleLoadMore = useCallback(async () => {
    const nextPage = page + 1
    setLoadMoreLoading(true)
    try {
      const params: Record<string, string | number> = { page: nextPage, limit: 20 }
      if (tab === "unread") params.unread = "true"
      if (tab === "system") params.category = "system"
      const res = await notificationsApi.getNotifications(params)
      setNotifications((prev) => [...prev, ...res.items])
      setTotalPages(res.meta.totalPages)
      setPage(nextPage)
    } catch (err: unknown) {
      setPageLoadError(getErrorMessage(err, "Failed to load notifications"))
    } finally {
      setLoadMoreLoading(false)
    }
  }, [page, tab])

  const handleMarkRead = useCallback(async (id: string, actionUrl?: string | null) => {
    setActionLoading(id)
    try {
      await notificationsApi.markNotificationRead(id)
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      decrementUnread()
      if (actionUrl) { router.push(actionUrl) }
    } catch (err: unknown) {
      setPageLoadError(getErrorMessage(err, "Failed to mark as read"))
      if (actionUrl) { router.push(actionUrl) }
    } finally {
      setActionLoading(null)
    }
  }, [decrementUnread, router])

  const handleMarkAllRead = useCallback(async () => {
    setMarkAllLoading(true)
    try {
      await notificationsApi.markAllNotificationsRead()
      setNotifications((prev) => prev.map((n) => n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
      resetUnread()
    } catch (err: unknown) {
      setPageLoadError(getErrorMessage(err, "Failed to mark all as read"))
    } finally {
      setMarkAllLoading(false)
    }
  }, [resetUnread])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await notificationsApi.deleteNotification(id)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      fetchUnreadCount()
    } catch (err: unknown) {
      setPageLoadError(getErrorMessage(err, "Failed to delete notification"))
    } finally {
      setDeleteConfirmId(null)
    }
  }, [fetchUnreadCount])

  const handleTabChange = useCallback((value: string) => {
    setTab(value)
    setPage(1)
    setTotalPages(1)
    setPageLoadKey((k) => k + 1)
  }, [])

  const readIds = useMemo(() => new Set(notifications.filter((n) => n.readAt).map((n) => n.id)), [notifications])

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
      <div>
        <div className="flex items-center justify-between mb-6">
          <div
            role="group"
            aria-label="Notification scope"
            className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-surface-elevated p-1 text-muted overflow-x-auto"
          >
            <button
              type="button"
              aria-pressed={tab === "all"}
              onClick={() => handleTabChange("all")}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer hover:text-foreground",
                tab === "all" ? "bg-surface text-foreground shadow-sm" : "text-muted",
              )}
            >
              <Notification className="mr-1.5" size={14} />
              All
              {unreadCount > 0 && tab === "all" && (
                <Badge variant="default" className="ml-2 h-5 min-w-5 px-1.5 text-[10px] justify-center">
                  {unreadCount}
                </Badge>
              )}
            </button>
            <button
              type="button"
              aria-pressed={tab === "unread"}
              onClick={() => handleTabChange("unread")}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer hover:text-foreground",
                tab === "unread" ? "bg-surface text-foreground shadow-sm" : "text-muted",
              )}
            >
              <MessageSquare className="mr-1.5" size={14} />
              Unread
            </button>
            <button
              type="button"
              aria-pressed={tab === "system"}
              onClick={() => handleTabChange("system")}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer hover:text-foreground",
                tab === "system" ? "bg-surface text-foreground shadow-sm" : "text-muted",
              )}
            >
              <Cpu className="mr-1.5" size={14} />
              System
            </button>
          </div>
        </div>

        {pageLoadError && (
          <div className="mb-4 rounded-lg border border-error/20 bg-error/5 px-4 py-2 text-sm text-error flex items-center justify-between">
            <span>{pageLoadError}</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPageLoadKey((k) => k + 1)}>Retry</Button>
          </div>
        )}

        {loading ? (
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
            notifications={notifications}
            readIds={readIds}
            actionLoading={actionLoading}
            onMarkRead={handleMarkRead}
            onDelete={(id) => setDeleteConfirmId(id)}
          />
        )}

        {page < totalPages && !loading && (
          <div className="flex justify-center mt-6">
            <Button
              variant="outline"
              size="sm"
              disabled={loadMoreLoading}
              onClick={handleLoadMore}
            >
              {loadMoreLoading ? "Loading..." : "Load More"}
            </Button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Notification</DialogTitle>
            <DialogDescription>Are you sure you want to delete this notification? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}

function NotificationGroups({
  notifications,
  readIds,
  actionLoading,
  onMarkRead,
  onDelete,
}: {
  notifications: NotificationResponse[]
  readIds: Set<string>
  actionLoading: string | null
  onMarkRead: (id: string, actionUrl?: string | null) => void
  onDelete: (id: string) => void
}) {
  const groups = Object.entries(groupByDate(notifications))

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
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (!read && !loading) onMarkRead(n.id, n.actionUrl) }}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !read && !loading) { e.preventDefault(); onMarkRead(n.id, n.actionUrl) } }}
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
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(n.id) }}
                    className="mt-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:text-error"
                    aria-label="Delete notification"
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
