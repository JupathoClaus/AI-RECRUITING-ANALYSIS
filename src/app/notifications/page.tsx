"use client"

import { useState, useMemo } from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
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
import { cn, timeAgo } from "@/lib/utils"

type NotificationType = "application" | "interview" | "offer" | "hire" | "rejection" | "ai" | "note"

interface Notification {
  id: string
  type: NotificationType
  candidateName: string
  jobTitle: string
  message: string
  timestamp: Date
  read: boolean
}

const notifications: Notification[] = [
  { id: "n1", type: "application", candidateName: "Marcus Johnson", jobTitle: "Senior Frontend Engineer", message: "applied for", timestamp: new Date("2026-07-15T10:45:00"), read: false },
  { id: "n2", type: "ai", candidateName: "David Park", jobTitle: "ML Engineer", message: "completed AI interview for", timestamp: new Date("2026-07-15T10:15:00"), read: false },
  { id: "n3", type: "interview", candidateName: "Emily Chen", jobTitle: "Senior Frontend Engineer", message: "accepted interview invite for", timestamp: new Date("2026-07-15T09:00:00"), read: false },
  { id: "n4", type: "offer", candidateName: "Sarah Kim", jobTitle: "Product Manager", message: "accepted the offer for", timestamp: new Date("2026-07-15T07:00:00"), read: true },
  { id: "n5", type: "hire", candidateName: "Alex Rivera", jobTitle: "Backend Engineer", message: "has been hired for", timestamp: new Date("2026-07-15T06:00:00"), read: true },
  { id: "n6", type: "rejection", candidateName: "Priya Patel", jobTitle: "ML Engineer", message: "was not selected for", timestamp: new Date("2026-07-15T03:00:00"), read: true },
  { id: "n7", type: "note", candidateName: "Tom Bradley", jobTitle: "Senior Frontend Engineer", message: "has a new note added by Sarah on", timestamp: new Date("2026-07-15T01:00:00"), read: true },
  { id: "n8", type: "ai", candidateName: "Nina Zhao", jobTitle: "Product Manager", message: "AI screening completed for", timestamp: new Date("2026-07-14T05:00:00"), read: true },
  { id: "n9", type: "application", candidateName: "Lisa Wang", jobTitle: "UX Designer", message: "applied for", timestamp: new Date("2026-07-14T03:00:00"), read: true },
  { id: "n10", type: "interview", candidateName: "James O'Brien", jobTitle: "DevOps Engineer", message: "completed on-site interview for", timestamp: new Date("2026-07-13T05:00:00"), read: true },
  { id: "n11", type: "application", candidateName: "Aisha Mohammed", jobTitle: "Technical Writer", message: "applied for", timestamp: new Date("2026-07-13T03:00:00"), read: true },
  { id: "n12", type: "note", candidateName: "Carlos Mendez", jobTitle: "DevOps Engineer", message: "left a comment on the profile for", timestamp: new Date("2026-07-11T05:00:00"), read: true },
  { id: "n13", type: "interview", candidateName: "Emily Chen", jobTitle: "Senior Frontend Engineer", message: "was rescheduled for", timestamp: new Date("2026-07-10T05:00:00"), read: true },
  { id: "n14", type: "offer", candidateName: "Sarah Kim", jobTitle: "Product Manager", message: "received an offer for", timestamp: new Date("2026-07-07T05:00:00"), read: true },
  { id: "n15", type: "ai", candidateName: "David Park", jobTitle: "ML Engineer", message: "AI behavioral analysis completed for", timestamp: new Date("2026-07-06T05:00:00"), read: true },
]

const typeIconMap: Record<NotificationType, typeof Notification> = {
  application: Document,
  interview: Calendar,
  offer: Gift,
  hire: UserAdd,
  rejection: UserRemove,
  ai: Cpu,
  note: MessageSquare,
}

const typeColorMap: Record<NotificationType, string> = {
  application: "bg-blue-500/15 text-blue-400",
  interview: "bg-purple-500/15 text-purple-400",
  offer: "bg-amber-500/15 text-amber-400",
  hire: "bg-emerald-500/15 text-emerald-400",
  rejection: "bg-red-500/15 text-red-400",
  ai: "bg-indigo-500/15 text-indigo-400",
  note: "bg-cyan-500/15 text-cyan-400",
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

function groupByDate(items: Notification[]): Record<string, Notification[]> {
  const groups: Record<string, Notification[]> = {}
  for (const n of items) {
    const key = getDateGroup(n.timestamp)
    if (!groups[key]) groups[key] = []
    groups[key].push(n)
  }
  return groups
}

export default function NotificationsPage() {
  const [readIds, setReadIds] = useState<Set<string>>(
    new Set(notifications.filter((n) => n.read).map((n) => n.id))
  )
  const [tab, setTab] = useState("all")

  const isRead = (id: string) => readIds.has(id)

  const markAllRead = () => {
    setReadIds(new Set(notifications.map((n) => n.id)))
  }

  const markRead = (id: string) => {
    setReadIds((prev) => new Set(prev).add(id))
  }

  const filtered = useMemo(() => {
    switch (tab) {
      case "unread":
        return notifications.filter((n) => !isRead(n.id))
      case "mentions":
        return notifications.filter((n) => n.type === "note")
      case "system":
        return notifications.filter((n) => n.type === "ai")
      default:
        return notifications
    }
  }, [tab, readIds])

  const unreadCount = notifications.filter((n) => !isRead(n.id)).length

  const grouped = groupByDate(filtered)

  return (
    <AppLayout
      title="Notifications"
      description="Stay updated on candidate activity and hiring pipeline changes"
      actions={
        <div className="flex items-center gap-1 sm:gap-3">
          <Button variant="ghost" size="sm" className="text-muted hover:text-foreground hidden sm:inline-flex">
            <Setting className="h-4 w-4 mr-2" />
            Preferences
          </Button>
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
            <TickCircle className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Mark all as read</span>
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
            <TabsTrigger value="mentions">
              <UserAdd className="mr-1.5" size={14} />
              Mentions
            </TabsTrigger>
            <TabsTrigger value="system">
              <Cpu className="mr-1.5" size={14} />
              System
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="all">
          <NotificationGroups grouped={grouped} isRead={isRead} markRead={markRead} />
        </TabsContent>
        <TabsContent value="unread">
          <NotificationGroups grouped={groupByDate(filtered)} isRead={isRead} markRead={markRead} />
        </TabsContent>
        <TabsContent value="mentions">
          <NotificationGroups grouped={groupByDate(filtered)} isRead={isRead} markRead={markRead} />
        </TabsContent>
        <TabsContent value="system">
          <NotificationGroups grouped={groupByDate(filtered)} isRead={isRead} markRead={markRead} />
        </TabsContent>
      </Tabs>
    </AppLayout>
  )
}

function NotificationGroups({
  grouped,
  isRead,
  markRead,
}: {
  grouped: Record<string, Notification[]>
  isRead: (id: string) => boolean
  markRead: (id: string) => void
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
              const Icon = typeIconMap[n.type]
              const read = isRead(n.id)
              return (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
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
                      typeColorMap[n.type]
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      <span className="font-semibold text-foreground">{n.candidateName}</span>{" "}
                      {n.message}{" "}
                      <span className="font-semibold text-foreground">{n.jobTitle}</span>
                    </p>
                    <p className="text-xs text-muted mt-1" suppressHydrationWarning>{timeAgo(n.timestamp)}</p>
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
