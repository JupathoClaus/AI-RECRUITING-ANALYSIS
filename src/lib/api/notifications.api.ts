import { apiRequest } from "./client"

export interface NotificationResponse {
  id: string
  userId: string
  companyId: string | null
  type: string
  title: string
  body: string | null
  readAt: string | null
  relatedEntityType: string | null
  relatedEntityId: string | null
  actionUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface NotificationListResponse {
  items: NotificationResponse[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface UnreadCountResponse {
  count: number
}

export async function getNotifications(params?: {
  page?: number
  limit?: number
  type?: string
  unread?: string
}): Promise<NotificationListResponse> {
  return apiRequest<NotificationListResponse>("/notifications", { params })
}

export async function getUnreadCount(): Promise<UnreadCountResponse> {
  return apiRequest<UnreadCountResponse>("/notifications/unread-count")
}

export async function markNotificationRead(notificationId: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/notifications/${notificationId}/read`, {
    method: "PATCH",
  })
}

export async function markAllNotificationsRead(): Promise<{ count: number }> {
  return apiRequest<{ count: number }>("/notifications/read-all", {
    method: "PATCH",
  })
}

export async function deleteNotification(notificationId: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/notifications/${notificationId}`, {
    method: "DELETE",
  })
}
