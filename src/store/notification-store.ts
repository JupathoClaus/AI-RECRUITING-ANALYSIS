import { create } from "zustand"
import { getUnreadCount } from "@/lib/api/notifications.api"
import type { NotificationResponse } from "@/lib/api/notifications.api"

interface NotificationStore {
  unreadCount: number
  notifications: NotificationResponse[]
  loading: boolean
  error: string | null
  fetchUnreadCount: () => Promise<void>
  decrementUnread: () => void
  resetUnread: () => void
  setUnreadCount: (count: number) => void
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  unreadCount: 0,
  notifications: [],
  loading: false,
  error: null,

  fetchUnreadCount: async () => {
    try {
      const res = await getUnreadCount()
      set({ unreadCount: res.count })
    } catch {
      // Non-critical — count stays at previous value
    }
  },

  decrementUnread: () => {
    const current = get().unreadCount
    if (current > 0) set({ unreadCount: current - 1 })
  },

  resetUnread: () => set({ unreadCount: 0 }),

  setUnreadCount: (count: number) => set({ unreadCount: count }),
}))
