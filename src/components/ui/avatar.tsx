"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"
import { cn, getInitials } from "@/lib/utils"

// ── Deterministic palette for initials fallback ────────────────────────────
// 8 brand-adjacent hues chosen for WCAG-AA contrast on white text.
const AVATAR_PALETTES = [
  { bg: "#0F9F8F", fg: "#FFFFFF" }, // teal
  { bg: "#172B4D", fg: "#FFFFFF" }, // navy
  { bg: "#2563EB", fg: "#FFFFFF" }, // blue
  { bg: "#7C3AED", fg: "#FFFFFF" }, // violet
  { bg: "#D97706", fg: "#FFFFFF" }, // amber-dark
  { bg: "#DC2626", fg: "#FFFFFF" }, // red
  { bg: "#059669", fg: "#FFFFFF" }, // emerald
  { bg: "#0369A1", fg: "#FFFFFF" }, // sky
]

function pickPalette(seed: string) {
  if (!seed) return AVATAR_PALETTES[0]
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length]
}

// ── Avatar ─────────────────────────────────────────────────────────────────
const Avatar = React.forwardRef<
  React.ComponentRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & {
    /** Text used to generate initials and palette when no image exists.
     *  Typically the person's display name. */
    fallback?: string
  }
>(({ className, fallback, children, ...props }, ref) => {
  const initials = fallback
    ? (fallback.length <= 2 ? fallback.toUpperCase() : getInitials(fallback).slice(0, 2).toUpperCase())
    : "?"
  const palette = pickPalette(fallback ?? "")

  return (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}
      {...props}
    >
      {children}
      <AvatarPrimitive.Fallback
        className="flex h-full w-full items-center justify-center rounded-full text-xs font-semibold select-none"
        style={{ background: palette.bg, color: palette.fg }}
        aria-label={fallback ? `${fallback} initials` : undefined}
      >
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
})
Avatar.displayName = AvatarPrimitive.Root.displayName

// ── AvatarImage ─────────────────────────────────────────────────────────────
const AvatarImage = React.forwardRef<
  React.ComponentRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full object-cover", className)}
    {...props}
  />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

export { Avatar, AvatarImage }
