import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

export function formatCurrency(num: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(num)
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function timeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return `${Math.floor(seconds / 604800)}w ago`
}

export function getScoreColor(score: number): string {
  if (score >= 90) return "text-success"
  if (score >= 75) return "text-primary"
  if (score >= 60) return "text-warning"
  return "text-error"
}

export function getScoreBgColor(score: number): string {
  if (score >= 90) return "bg-success"
  if (score >= 75) return "bg-primary"
  if (score >= 60) return "bg-warning"
  return "bg-error"
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error && typeof (error as Record<string, unknown>).message === "string") {
    return (error as { message: string }).message
  }
  return fallback
}

export function getStatusBadgeVariant(
  status: string
): "default" | "secondary" | "success" | "warning" | "error" | "info" {
  switch (status) {
    case "Hired":
      return "success"
    case "Offer":
      return "info"
    case "Interview":
      return "default"
    case "Screening":
      return "warning"
    case "Applied":
      return "secondary"
    case "Rejected":
      return "error"
    default:
      return "secondary"
  }
}
