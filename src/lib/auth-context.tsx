"use client"

import * as React from "react"
import * as authApi from "./api/auth.api"
import { clearTokens, isAuthenticated } from "./api/client"
import type { RegisterCompanyRequest, RegisterCompanyResponse } from "./api/types"

export interface User {
  id: string
  name: string
  email: string
  role: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ error?: string }>
  register: (dto: RegisterCompanyRequest) => Promise<{ error?: string; data?: RegisterCompanyResponse }>
  logout: () => void
}

const AuthContext = React.createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => ({}),
  register: async () => ({ error: "AuthProvider not initialized" }),
  logout: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!isAuthenticated()) return

    let cancelled = false
    authApi
      .getMe()
      .then((me) => {
        if (cancelled) return
        const u: User = {
          id: me.user.id,
          name: `${me.user.firstName} ${me.user.lastName}`.trim(),
          email: me.user.email,
          role: me.role || "VIEWER",
        }
        setUser(u)
      })
      .catch(() => {
        if (!cancelled) clearTokens()
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  const login = React.useCallback(async (email: string, password: string) => {
    try {
      const result = await authApi.login({ email, password })
      const u: User = {
        id: result.user.id,
        name: `${result.user.firstName} ${result.user.lastName}`.trim(),
        email: result.user.email,
        role: result.role,
      }
      setUser(u)
      return {}
    } catch (err: unknown) {
      const apiErr = err as { message?: string }
      return { error: apiErr.message || "Invalid email or password" }
    }
  }, [])

  const register = React.useCallback(async (dto: RegisterCompanyRequest) => {
    try {
      const result = await authApi.registerCompany(dto)
      return { data: result }
    } catch (err: unknown) {
      const apiErr = err as { message?: string; errors?: string[] }
      if (apiErr.errors?.length) {
        return { error: apiErr.errors.join(" ") }
      }
      return { error: apiErr.message || "Registration failed. Please try again." }
    }
  }, [])

  const logout = React.useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      clearTokens()
    }
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return React.useContext(AuthContext)
}
