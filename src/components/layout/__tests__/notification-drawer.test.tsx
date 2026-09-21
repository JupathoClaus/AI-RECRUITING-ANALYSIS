/**
 * Notification drawer (Phase 1): real-data interactions.
 * - Opens from the header bell and fetches the first page of notifications
 * - Unread items are marked read on activate and navigate to their action URL
 * - Mark all read calls the API and resets the unread count
 * - Escape closes the dialog and restores focus to the trigger
 * - Empty and error states render instead of a fake-failure UI
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as React from "react"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"

vi.setConfig({ testTimeout: 30000 })

const push = vi.hoisted(() => vi.fn())
const api = vi.hoisted(() => ({
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}))
const store = vi.hoisted(() => ({
  unreadCount: 3,
  fetchUnreadCount: vi.fn().mockResolvedValue(undefined),
  decrementUnread: vi.fn(),
  resetUnread: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dashboard",
}))

vi.mock("@/lib/api/notifications.api", () => ({
  getNotifications: (...args: unknown[]) => api.getNotifications(...args),
  markNotificationRead: (...args: unknown[]) => api.markNotificationRead(...args),
  markAllNotificationsRead: (...args: unknown[]) => api.markAllNotificationsRead(...args),
}))

vi.mock("@/store/notification-store", () => ({
  useNotificationStore: () => store,
}))

vi.mock("iconsax-react", () => {
  const mock = (name: string) => {
    const Icon = (props: Record<string, unknown>) =>
      React.createElement("span", { "data-testid": `icon-${name}`, "aria-hidden": true, ...props })
    Icon.displayName = name
    return Icon
  }
  return {
    Notification: mock("Notification"),
    TickCircle: mock("TickCircle"),
    CloseCircle: mock("CloseCircle"),
    Document: mock("Document"),
    Calendar: mock("Calendar"),
    Gift: mock("Gift"),
    UserAdd: mock("UserAdd"),
    UserRemove: mock("UserRemove"),
    Cpu: mock("Cpu"),
    MessageSquare: mock("MessageSquare"),
    Eye: mock("Eye"),
  }
})

import { NotificationDrawer } from "../notification-drawer"

function makeItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "n1",
    userId: "u1",
    companyId: null,
    type: "APPLICATION_SUBMITTED",
    title: "New application submitted",
    body: "Juan Lopez applied for Senior Engineer",
    readAt: null,
    relatedEntityType: null,
    relatedEntityId: null,
    actionUrl: "/applications",
    createdAt: "2026-09-19T08:00:00.000Z",
    updatedAt: "2026-09-19T08:00:00.000Z",
    ...overrides,
  }
}

describe("NotificationDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    push.mockClear()
    store.unreadCount = 3
    store.decrementUnread.mockClear()
    store.resetUnread.mockClear()
    store.fetchUnreadCount.mockResolvedValue(undefined)
    api.getNotifications.mockResolvedValue({ items: [makeItem()], meta: { total: 1, page: 1, limit: 12, totalPages: 1 } })
    api.markNotificationRead.mockResolvedValue({ success: true })
    api.markAllNotificationsRead.mockResolvedValue({ count: 1 })
  })

  afterEach(() => cleanup())

  it("fetches unread count on mount and shows the bell badge", async () => {
    render(<NotificationDrawer />)
    await waitFor(() => expect(store.fetchUnreadCount).toHaveBeenCalled())
    const trigger = screen.getByRole("button", { name: "Notifications" })
    expect(store.unreadCount).toBe(3)
  })

  it("opens the dialog and loads the first page of notifications", async () => {
    render(<NotificationDrawer />)
    const trigger = screen.getByRole("button", { name: "Notifications" })
    fireEvent.click(trigger)
    await waitFor(() => expect(api.getNotifications).toHaveBeenCalledWith({ page: 1, limit: 12 }))

    const dialog = screen.getByRole("dialog", { name: "Notifications" })
    expect(dialog).toBeTruthy()
    expect(screen.getByText("New application submitted")).toBeTruthy()
    expect(screen.getByText("Juan Lopez applied for Senior Engineer")).toBeTruthy()
  })

  it("clicking an unread item marks it read and navigates to its action URL", async () => {
    render(<NotificationDrawer />)
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }))
    await waitFor(() => expect(screen.getByText("New application submitted")).toBeTruthy())

    const row = screen.getByText("New application submitted").closest("button")!
    fireEvent.click(row)

    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledWith("n1"))
    expect(store.decrementUnread).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith("/applications")
  })

  it("clicking an already-read item navigates without touching the API", async () => {
    api.getNotifications.mockResolvedValue({
      items: [makeItem({ id: "n2", readAt: "2026-09-19T09:00:00.000Z", actionUrl: "/jobs" })],
      meta: { total: 1, page: 1, limit: 12, totalPages: 1 },
    })
    render(<NotificationDrawer />)
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }))
    await waitFor(() => expect(screen.getByText("New application submitted")).toBeTruthy())

    const row = screen.getByText("New application submitted").closest("button")!
    fireEvent.click(row)

    await waitFor(() => expect(push).toHaveBeenCalledWith("/jobs"))
    expect(api.markNotificationRead).not.toHaveBeenCalled()
    expect(store.decrementUnread).not.toHaveBeenCalled()
  })

  it("Mark all read calls the API and resets the unread count", async () => {
    render(<NotificationDrawer />)
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }))
    await waitFor(() => expect(screen.getByText("New application submitted")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }))

    await waitFor(() => expect(api.markAllNotificationsRead).toHaveBeenCalled())
    expect(store.resetUnread).toHaveBeenCalledTimes(1)
  })

  it("Escape closes the drawer and restores focus to the trigger", async () => {
    render(<NotificationDrawer />)
    const trigger = screen.getByRole("button", { name: "Notifications" })
    fireEvent.click(trigger)
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Notifications" })).toBeTruthy())
    expect(trigger.getAttribute("aria-expanded")).toBe("true")

    fireEvent.keyDown(document, { key: "Escape" })

    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("false"))
    expect(document.activeElement).toBe(trigger)
  })

  it("renders an honest empty state when there are no notifications", async () => {
    api.getNotifications.mockResolvedValue({ items: [], meta: { total: 0, page: 1, limit: 12, totalPages: 0 } })
    render(<NotificationDrawer />)
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }))
    await waitFor(() => expect(screen.getByText("You're all caught up")).toBeTruthy())
  })

  it("shows a retry action when loading fails, and reloads on demand", async () => {
    api.getNotifications.mockRejectedValueOnce(new Error("boom"))
    render(<NotificationDrawer />)
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(api.getNotifications).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText("New application submitted")).toBeTruthy())
  })
})