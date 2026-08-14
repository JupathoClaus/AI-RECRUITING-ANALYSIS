import { describe, expect, it } from "vitest"
import { formatRoleLabel } from "../settings-utils"

describe("formatRoleLabel", () => {
  it.each([
    ["COMPANY_ADMIN", "Company Admin"],
    ["HIRING_MANAGER", "Hiring Manager"],
    ["RECRUITER", "Recruiter"],
    ["viewer", "Viewer"],
    ["custom-role", "Custom Role"],
  ])("formats %s for display", (role, expected) => {
    expect(formatRoleLabel(role)).toBe(expected)
  })

  it("falls back to Viewer when no role is available", () => {
    expect(formatRoleLabel(null)).toBe("Viewer")
    expect(formatRoleLabel(undefined)).toBe("Viewer")
  })
})
