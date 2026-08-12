"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { CandidateLayout } from "@/components/candidate/candidate-layout"
import { FadeIn } from "@/components/candidate/page-transition"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { verifyInterviewCode } from "@/lib/api/ai-interviews.api"
import { ApiErrorResponse } from "@/lib/api/client"
import { saveCandidateInterviewSession } from "@/lib/candidate-interview-session"

type ViewState = "idle" | "loading" | "error" | "expired"

export default function CandidateLandingPage() {
  const router = useRouter()
  const [code, setCode] = React.useState("")
  const [viewState, setViewState] = React.useState<ViewState>("idle")
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([])

  const codeLength = 13
  const formattedCode = code.toUpperCase().replace(/[^A-Z0-9-]/g, "")

  const handleSubmit = async () => {
    if (formattedCode.length < 5) return
    setViewState("loading")
    try {
      const session = await verifyInterviewCode(formattedCode)
      saveCandidateInterviewSession(session)
      router.push("/candidate/interview/details")
    } catch (error) {
      if (error instanceof ApiErrorResponse && error.errorCode === "INTERVIEW_EXPIRED") {
        setViewState("expired")
      } else {
        setViewState("error")
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit()
  }

  const handleReset = () => {
    setViewState("idle")
    setCode("")
    inputRefs.current[0]?.focus()
  }

  return (
    <CandidateLayout>
      <div className="relative min-h-[calc(100vh-120px)] flex items-center justify-center px-4 py-12">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />

        <FadeIn className="relative w-full max-w-md">
          <motion.div
            layout
            className="rounded-3xl bg-surface p-8 sm:p-10 shadow-xl border border-border/50"
          >
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <svg className="h-7 w-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
            </div>

            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-xl font-bold text-foreground">Welcome to AI Recruiter</h1>
              <p className="mt-2 text-sm text-muted leading-relaxed">
                Enter the interview code provided by your recruiter to begin your AI-powered interview.
              </p>
            </div>

            <AnimatePresence mode="wait">
              {viewState === "idle" && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  {/* Code Input */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Interview Code
                    </label>
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      onKeyDown={handleKeyDown}
                      placeholder="AIR-2026-8XKQ4M"
                      className={cn(
                        "w-full rounded-xl border border-border bg-background px-4 py-3.5 text-center text-lg font-mono font-semibold tracking-[0.2em] text-foreground placeholder:text-muted/40 placeholder:tracking-[0.15em]",
                        "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200"
                      )}
                      maxLength={20}
                      autoFocus
                    />
                  </div>

                  {/* Submit */}
                  <Button
                    onClick={handleSubmit}
                    className="w-full h-12 rounded-xl text-sm font-semibold"
                    disabled={formattedCode.length < 5}
                  >
                    Access Interview
                  </Button>

                  {/* Help */}
                  <div className="text-center">
                    <p className="text-xs text-muted">
                      Don&apos;t have a code?{" "}
                      <button className="text-primary font-medium hover:underline">
                        Contact your recruiter
                      </button>
                    </p>
                  </div>
                </motion.div>
              )}

              {viewState === "loading" && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center gap-4 py-8"
                >
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="text-sm text-muted">Validating interview code...</p>
                </motion.div>
              )}

              {viewState === "error" && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-4"
                >
                  <div className="rounded-xl bg-error/5 border border-error/20 p-4">
                    <div className="flex items-center gap-2">
                      <svg className="h-5 w-5 text-error shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      <div>
                        <p className="text-sm font-semibold text-error">Invalid Interview Code</p>
                        <p className="text-xs text-error/80 mt-0.5">
                          The code you entered is not recognized. Please check and try again.
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button onClick={handleReset} variant="outline" className="w-full h-11 rounded-xl">
                    Try Again
                  </Button>
                </motion.div>
              )}

              {viewState === "expired" && (
                <motion.div
                  key="expired"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-4"
                >
                  <div className="rounded-xl bg-warning/5 border border-warning/20 p-4">
                    <div className="flex items-center gap-2">
                      <svg className="h-5 w-5 text-warning shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-semibold text-warning">Interview Expired</p>
                        <p className="text-xs text-warning/80 mt-0.5">
                          This interview invitation has expired. Please contact your recruiter for a new invitation.
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button onClick={handleReset} variant="outline" className="w-full h-11 rounded-xl">
                    Try Again
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Features */}
            <div className="mt-8 pt-6 border-t border-border">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon: "AI", label: "AI-Powered" },
                  { icon: "45m", label: "Quick Process" },
                  { icon: "24/7", label: "Anytime" },
                ].map((f) => (
                  <div key={f.label} className="text-center">
                    <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated">
                      <span className="text-[10px] font-bold text-primary">{f.icon}</span>
                    </div>
                    <p className="text-[10px] text-muted">{f.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </FadeIn>
      </div>
    </CandidateLayout>
  )
}
