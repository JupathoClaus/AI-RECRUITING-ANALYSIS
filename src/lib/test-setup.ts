/// <reference types="vitest/globals" />
import "@testing-library/jest-dom"

// Vitest-compatible mock declarations
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/reports",
}))
