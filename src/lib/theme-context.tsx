"use client"

import * as React from "react"

interface ThemeContextType {
  theme: "light" | "dark"
  toggleTheme: () => void
}

const ThemeContext = React.createContext<ThemeContextType>({
  theme: "light",
  toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<"light" | "dark">("light")

  React.useEffect(() => {
    const stored = localStorage.getItem("ai-recruiter-theme") as "light" | "dark" | null
    const prefersDark = matchMedia("(prefers-color-scheme:dark)").matches
    const resolved = stored === "dark" || (!stored && prefersDark) ? "dark" : "light"
    setTheme(resolved) // eslint-disable-line react-hooks/set-state-in-effect -- hydration from localStorage
    document.documentElement.classList.toggle("dark", resolved === "dark")
  }, [])

  const toggleTheme = React.useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light"
      localStorage.setItem("ai-recruiter-theme", next)
      document.documentElement.classList.toggle("dark", next === "dark")
      return next
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return React.useContext(ThemeContext)
}
