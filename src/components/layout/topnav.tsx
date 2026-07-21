"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Notification, ArrowDown2, Moon, Sun, Information, User, Setting, Logout } from "iconsax-react"
import { useTheme } from "@/lib/theme-context"
import Link from "next/link"

interface TopNavProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

export function TopNav({ title, description, actions }: TopNavProps) {
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const router = useRouter()

  const handleLogout = () => {
    logout()
    router.push("/login")
  }

  const userInitials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("")
    : "U"

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/80 backdrop-blur-md px-4 sm:px-6">
      {/* Spacer for mobile hamburger */}
      <div className="w-10 lg:hidden" />

      <div className="flex flex-1 items-center gap-4 min-w-0">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground leading-none truncate">{title}</h1>
          {description && <p className="text-xs text-muted mt-1 truncate hidden sm:block">{description}</p>}
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {actions}

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-9 w-9 hidden sm:inline-flex"
          title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          suppressHydrationWarning
        >
          {theme === "light" ? (
            <Moon className="h-4 w-4" suppressHydrationWarning />
          ) : (
            <Sun className="h-4 w-4" suppressHydrationWarning />
          )}
        </Button>

        <Link
          href="/notifications"
          className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors duration-150"
          aria-label="Notifications"
        >
          <Notification className="h-4 w-4" />
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 h-9 px-2.5">
              <Avatar className="h-6 w-6" fallback={userInitials}>
                <AvatarImage src="/avatars/sarah.jpg" alt={user?.name || "User"} />
              </Avatar>
              <span className="text-sm font-medium hidden sm:inline">{user?.name?.split(" ")[0] || "User"}</span>
              <ArrowDown2 className="h-3.5 w-3.5 text-muted hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name || "User"}</p>
                <p className="text-xs text-muted">{user?.email || ""}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Setting className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Information className="mr-2 h-4 w-4" />
              Help & Support
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-error" onClick={handleLogout}>
              <Logout className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
