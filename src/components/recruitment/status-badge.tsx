import { Badge } from "@/components/ui/badge"

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "error" | "info" | "outline"

function labelFor(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function variantForApplicationStatus(status: string): BadgeVariant {
  switch (status) {
    case "HIRED":
      return "success"
    case "REJECTED":
    case "WITHDRAWN":
    case "DISQUALIFIED":
      return "error"
    case "ON_HOLD":
      return "warning"
    case "INTERVIEW":
    case "ASSESSMENT":
    case "OFFER":
      return "info"
    case "SHORTLISTED":
      return "default"
    default:
      return "secondary"
  }
}

function variantForInterviewStatus(status: string): BadgeVariant {
  switch (status) {
    case "COMPLETED":
      return "success"
    case "CANCELLED":
    case "NO_SHOW":
    case "EXPIRED":
      return "error"
    case "IN_PROGRESS":
      return "default"
    default:
      return "secondary"
  }
}

function variantForJobStatus(status: string): BadgeVariant {
  switch (status) {
    case "PUBLISHED":
      return "success"
    case "PAUSED":
    case "PENDING_APPROVAL":
      return "warning"
    case "CLOSED":
    case "FILLED":
    case "CANCELLED":
    case "ARCHIVED":
      return "secondary"
    default:
      return "outline"
  }
}

export function ApplicationStatusBadge({ status }: { status: string }) {
  return <Badge variant={variantForApplicationStatus(status)}>{labelFor(status)}</Badge>
}

export function InterviewStatusBadge({ status }: { status: string }) {
  return <Badge variant={variantForInterviewStatus(status)}>{labelFor(status)}</Badge>
}

export function JobStatusBadge({ status }: { status: string }) {
  return <Badge variant={variantForJobStatus(status)}>{labelFor(status)}</Badge>
}

export function ScreeningStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge variant="outline">Not screened</Badge>

  const variant: BadgeVariant = status === "COMPLETED"
    ? "success"
    : status === "FAILED"
      ? "error"
      : status === "RUNNING"
        ? "default"
        : "warning"

  return <Badge variant={variant}>{labelFor(status)}</Badge>
}

export function formatStatusLabel(status: string | null | undefined, fallback = "Unavailable") {
  return status ? labelFor(status) : fallback
}
