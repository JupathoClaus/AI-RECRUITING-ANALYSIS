"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { InterviewShell } from "@/components/interview/interview-shell"
import {
  Camera,
  Volume2,
  Wifi,
  MessageSquareText,
  MonitorUp,
  FileAudio,
  Sparkles,
  Accessibility,
  ArrowRight,
  Check,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

const INSTRUCTIONS = [
  {
    icon: Camera,
    title: "Camera & Microphone",
    text: "Make sure your camera and microphone are available before you begin.",
  },
  {
    icon: Volume2,
    title: "Quiet Environment",
    text: "Choose a quiet and well-lit location where you can focus.",
  },
  {
    icon: Wifi,
    title: "Stable Internet",
    text: "Use a reliable connection throughout the interview.",
  },
  {
    icon: MessageSquareText,
    title: "Answer Naturally",
    text: "Respond honestly and take your time. There are no trick questions.",
  },
  {
    icon: MonitorUp,
    title: "Stay on the Page",
    text: "Do not refresh, close, or leave the interview page while it is active.",
  },
  {
    icon: FileAudio,
    title: "Recording & Transcript",
    text: "The interview may be recorded and transcribed for recruitment review.",
  },
  {
    icon: Sparkles,
    title: "AI-Assisted Interview",
    text: "The AI interviewer supports the recruitment process. Final decisions remain with the employer.",
  },
]

const CONSENT_ITEMS = [
  "I understand that this interview may be recorded and transcribed for recruitment purposes.",
  "I have reviewed the interview instructions and I am ready to begin.",
]

export default function InterviewPreparationPage() {
  const router = useRouter()
  const accessToken = React.useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : sessionStorage.getItem("ai-interview-access-token"),
    [],
  )
  const candidateFirstName =
    typeof window === "undefined"
      ? ""
      : sessionStorage.getItem("ai-interview-candidate-first-name") || "there"
  const jobTitle =
    typeof window === "undefined" ? "" : sessionStorage.getItem("ai-interview-job-title") || ""

  const [accommodation, setAccommodation] = React.useState<"no" | "yes" | null>(null)
  const [accommodationNotes, setAccommodationNotes] = React.useState("")
  const [consent, setConsent] = React.useState<boolean[]>([false, false])

  const allConsented = consent.every(Boolean)

  React.useEffect(() => {
    if (!accessToken) {
      router.replace("/interview/access")
    }
  }, [accessToken, router])

  if (!accessToken) return null

  const toggleConsent = (index: number) => {
    setConsent((prev) => prev.map((v, i) => (i === index ? !v : v)))
  }

  return (
    <InterviewShell step={2} stepCount={4} stepLabels={["Welcome", "Instructions", "Device check", "Interview"]}>
      <Card className="overflow-hidden shadow-card">
        <div className="border-b border-border/60 bg-gradient-to-b from-primary-subtle to-transparent px-6 pb-6 pt-7 sm:px-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Get ready, {candidateFirstName}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            {jobTitle ? `Before your interview for ${jobTitle}, ` : "Before your interview, "}
            please review the instructions below.
          </p>
        </div>

        <CardContent className="px-6 py-6 sm:px-8">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {INSTRUCTIONS.map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-3 rounded-xl border border-border/70 bg-surface-elevated/60 p-3.5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-muted">
                  <item.icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.text}</p>
                </div>
              </div>
            ))}
          </div>

          <section className="mt-6 rounded-xl border border-border/70 bg-surface-elevated/50 p-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-muted">
                <Accessibility className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Accessibility & accommodations
                </h2>
                <p className="text-xs text-muted">
                  Do you require any accessibility adjustment or interview accommodation?
                </p>
              </div>
            </div>

            <fieldset className="mt-4 space-y-2.5">
              <legend className="sr-only">Accommodation preference</legend>
              {(
                [
                  ["no", "No, I can continue normally."],
                  ["yes", "Yes, I need an adjustment."],
                ] as const
              ).map(([value, label]) => {
                const selected = accommodation === value
                return (
                  <label
                    key={value}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 transition-colors",
                      selected
                        ? "border-primary/50 bg-primary-muted"
                        : "border-border bg-surface hover:bg-surface-hover",
                    )}
                  >
                    <input
                      type="radio"
                      name="accommodation"
                      value={value}
                      checked={selected}
                      onChange={() => setAccommodation(value)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-sm text-foreground">{label}</span>
                    {selected && (
                      <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                        <Check className="h-3 w-3 text-white" />
                      </span>
                    )}
                  </label>
                )
              })}
            </fieldset>

            {accommodation === "yes" && (
              <div className="mt-3">
                <label
                  htmlFor="accommodation-notes"
                  className="mb-1.5 block text-xs font-medium text-foreground"
                >
                  Please tell us what adjustment would help you participate in the interview.
                </label>
                <textarea
                  id="accommodation-notes"
                  value={accommodationNotes}
                  onChange={(e) => setAccommodationNotes(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="e.g. I would benefit from slightly longer response time."
                  className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary"
                />
                <p className="mt-1 text-[11px] text-muted">
                  This information is used only to support your participation and never influences
                  the evaluation of your interview.
                </p>
              </div>
            )}
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-semibold text-foreground">Consent</h2>
            <p className="mt-0.5 text-xs text-muted">
              Please confirm the following before your interview can begin.
            </p>
            <div className="mt-3 space-y-2.5">
              {CONSENT_ITEMS.map((text, i) => {
                const checked = consent[i]
                return (
                  <label
                    key={i}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors",
                      checked ? "border-primary/50 bg-primary-muted" : "border-border bg-surface hover:bg-surface-hover",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleConsent(i)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                    />
                    <span className="text-sm leading-relaxed text-foreground">{text}</span>
                  </label>
                )
              })}
            </div>
            {!allConsented && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <X className="h-3.5 w-3.5" />
                Please complete both confirmations to continue.
              </p>
            )}
          </section>

          <Button
            size="lg"
            className="mt-6 w-full"
            disabled={!allConsented}
            onClick={() => {
              sessionStorage.setItem(
                "ai-interview-accommodation",
                accommodation === "yes" ? "yes" : "no",
              )
              sessionStorage.setItem(
                "ai-interview-accommodation-notes",
                accommodation === "yes" ? accommodationNotes.trim() : "",
              )
              sessionStorage.setItem("ai-interview-consent", "true")
              router.push("/interview/device-check")
            }}
          >
            Check camera & microphone
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </InterviewShell>
  )
}