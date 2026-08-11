import { it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { AuthProvider, useAuth } from "../auth-context"

vi.mock("../api/auth.api", () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  registerCompany: vi.fn(),
  logout: vi.fn(),
}))

vi.mock("../api/client", () => {
  let storedToken: string | null = "mock-token"
  return {
    getAccessToken: vi.fn(() => storedToken),
    isAuthenticated: vi.fn(() => !!storedToken),
    clearTokens: vi.fn(() => { storedToken = null }),
    apiRequest: vi.fn(),
  }
})

function TestConsumer() {
  const { user, loading } = useAuth()
  if (loading) return <div data-testid="loading">Loading...</div>
  if (user) return <div data-testid="user">{user.name}</div>
  return <div data-testid="no-user">No user</div>
}

beforeEach(() => {
  vi.clearAllMocks()
})

it("unauthenticated user sees no-user state (loading resolves)", async () => {
  const { isAuthenticated } = await import("../api/client")
  vi.mocked(isAuthenticated).mockReturnValue(false)

  render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>,
  )

  await waitFor(() => {
    expect(screen.getByTestId("no-user")).toBeDefined()
  })
})

it("authenticated user shows user after getMe resolves", async () => {
  const { isAuthenticated } = await import("../api/client")
  const { getMe } = await import("../api/auth.api")
  vi.mocked(isAuthenticated).mockReturnValue(true)
  vi.mocked(getMe).mockResolvedValue({
    user: { id: "1", firstName: "Test", lastName: "User", email: "t@t.com", status: "ACTIVE", timezone: "UTC", avatarUrl: null },
    role: "COMPANY_ADMIN",
    permissions: ["reports.read"],
    activeCompany: null,
  })

  render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>,
  )

  await waitFor(() => {
    expect(screen.getByTestId("user")).toBeDefined()
  })
  expect(screen.getByTestId("user").textContent).toBe("Test User")
})

it("authenticated user with failed getMe resolves to no-user", async () => {
  const { isAuthenticated } = await import("../api/client")
  const { getMe } = await import("../api/auth.api")
  vi.mocked(isAuthenticated).mockReturnValue(true)
  vi.mocked(getMe).mockRejectedValue(new Error("Network error"))

  render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>,
  )

  await waitFor(() => {
    expect(screen.getByTestId("no-user")).toBeDefined()
  })
})
