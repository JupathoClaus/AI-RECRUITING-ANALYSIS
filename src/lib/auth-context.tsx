"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

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
  register: (name: string, email: string, password: string, role: string) => Promise<{ error?: string }>
  logout: () => void
}

const AuthContext = React.createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => ({}),
  register: async () => ({}),
  logout: () => {},
})

const USERS_KEY = "ai-recruiter-users"
const SESSION_KEY = "ai-recruiter-session"

interface StoredUser extends User {
  password: string
}

function getStoredUsers(): StoredUser[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(USERS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveStoredUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function getStoredSession(): User | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveStoredSession(user: User | null) {
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(SESSION_KEY)
  }
}

function seedDefaultUsers() {
  const users = getStoredUsers()
  if (users.length === 0) {
    const defaultUsers: StoredUser[] = [
      { id: "u1", name: "Sarah Anderson", email: "sarah@airecruiter.com", password: "admin123", role: "Admin" },
      { id: "u2", name: "David Park", email: "david@airecruiter.com", password: "admin123", role: "Recruiter" },
      { id: "u3", name: "Emily Chen", email: "emily@airecruiter.com", password: "admin123", role: "Interviewer" },
    ]
    saveStoredUsers(defaultUsers)
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    seedDefaultUsers()
    const session = getStoredSession()
    if (session) {
      setUser(session)
    }
    setLoading(false)
  }, [])

  const login = React.useCallback(async (email: string, password: string) => {
    const users = getStoredUsers()
    const found = users.find((u) => u.email === email && u.password === password)
    if (!found) {
      return { error: "Invalid email or password" }
    }
    const sessionUser: User = { id: found.id, name: found.name, email: found.email, role: found.role }
    setUser(sessionUser)
    saveStoredSession(sessionUser)
    return {}
  }, [])

  const register = React.useCallback(async (name: string, email: string, password: string, role: string) => {
    const users = getStoredUsers()
    if (users.find((u) => u.email === email)) {
      return { error: "An account with this email already exists" }
    }
    const newUser: StoredUser = {
      id: `u${Date.now()}`,
      name,
      email,
      password,
      role,
    }
    users.push(newUser)
    saveStoredUsers(users)
    const sessionUser: User = { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role }
    setUser(sessionUser)
    saveStoredSession(sessionUser)
    return {}
  }, [])

  const logout = React.useCallback(() => {
    setUser(null)
    saveStoredSession(null)
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
