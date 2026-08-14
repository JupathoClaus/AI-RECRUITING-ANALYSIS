import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Avatar } from "./avatar"

describe("Avatar", () => {
  it("renders initials through the Radix fallback", () => {
    render(<Avatar fallback="SC" />)

    expect(screen.getByText("SC")).toBeInTheDocument()
  })
})
