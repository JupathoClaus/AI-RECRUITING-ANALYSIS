"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { CandidateLayout } from "@/components/candidate/candidate-layout"
import { FadeIn, ScaleIn } from "@/components/candidate/page-transition"
import { Button } from "@/components/ui/button"
import { mockInterview } from "@/lib/candidate-mock-data"
import { CheckCircle, Home, Copy, Clock, Mail } from "lucide-react"

export default function InterviewCompletedPage() {
  const [copied, setCopied] = React.useState(false)
  const referenceNumber = `REF-${Date.now().toString(36).toUpperCase()}`

  const handleCopy = () => {
    navigator.clipboard.writeText(referenceNumber)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <CandidateLayout>
      <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-4 py-12">
        <FadeIn className="w-full max-w-lg">
          <div className="rounded-3xl bg-surface shadow-xl border border-border/50 overflow-hidden text-center">
            {/* Success Animation */}
            <div className="pt-10 pb-6">
              <ScaleIn>
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                  >
                    <CheckCircle className="h-10 w-10 text-success" />
                  </motion.div>
                </div>
              </ScaleIn>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-6 px-6"
              >
                <h1 className="text-2xl font-bold text-foreground">Interview Completed</h1>
                <p className="mt-3 text-sm text-muted leading-relaxed">
                  Thank you for completing your AI interview for the <strong className="text-foreground">{mockInterview.jobTitle}</strong> position at <strong className="text-foreground">{mockInterview.company.name}</strong>.
                </p>
              </motion.div>
            </div>

            <div className="px-6 sm:px-8 pb-8 space-y-5">
              {/* Info Cards */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="rounded-2xl bg-surface-elevated p-5 space-y-4"
              >
                <div className="flex items-center gap-3 text-left">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Recruiter Will Review</p>
                    <p className="text-xs text-muted">Your responses are being sent to the hiring team for review.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-left">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Estimated Review Time</p>
                    <p className="text-xs text-muted">You should hear back within 2-3 business days.</p>
                  </div>
                </div>
              </motion.div>

              {/* Reference Number */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="rounded-2xl bg-surface-elevated p-4"
              >
                <p className="text-[11px] font-medium text-muted uppercase tracking-wide mb-2">Reference Number</p>
                <div className="flex items-center justify-center gap-2">
                  <p className="text-lg font-mono font-bold text-primary">{referenceNumber}</p>
                  <button
                    onClick={handleCopy}
                    className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-surface transition-colors"
                    title="Copy reference"
                  >
                    <Copy className="h-3.5 w-3.5 text-muted" />
                  </button>
                </div>
                {copied && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-success mt-1"
                  >
                    Copied to clipboard
                  </motion.p>
                )}
              </motion.div>

              {/* Return Home */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
              >
                <Link href="/candidate">
                  <Button className="w-full h-12 rounded-xl">
                    <Home className="h-4 w-4 mr-2" />
                    Return Home
                  </Button>
                </Link>
              </motion.div>
            </div>
          </div>
        </FadeIn>
      </div>
    </CandidateLayout>
  )
}
