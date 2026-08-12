"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CandidateLayout } from "@/components/candidate/candidate-layout"
import { FadeIn } from "@/components/candidate/page-transition"
import { Button } from "@/components/ui/button"
import { getInterviewSession } from "@/lib/api/ai-interviews.api"
import {
  loadCandidateInterviewSession,
  saveCandidateInterviewSession,
  type CandidateInterviewSession,
} from "@/lib/candidate-interview-session"
import { Clock, Globe, Mic, Shield, Video, ArrowRight, X } from "lucide-react"

const instructions = [
  { icon: Video, label: "Camera Required", desc: "Ensure your camera is working" },
  { icon: Mic, label: "Microphone Required", desc: "A working mic is needed" },
  { icon: Globe, label: "Stable Internet", desc: "Connect to a reliable network" },
  { icon: Shield, label: "Quiet Environment", desc: "Find a distraction-free space" },
]

export default function InterviewDetailsPage() {
  const router = useRouter()
  const [session, setSession] = React.useState<CandidateInterviewSession | null>(null)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    const stored = loadCandidateInterviewSession()
    if (!stored) {
      router.replace("/candidate")
      return
    }

    getInterviewSession(stored.accessToken)
      .then((latest) => {
        const next = { ...latest, accessToken: stored.accessToken }
        saveCandidateInterviewSession(next)
        setSession(next)
      })
      .catch(() => setError("This interview session is no longer available. Please enter your code again."))
  }, [router])

  return (
    <CandidateLayout>
      <div className="min-h-[calc(100vh-120px)] py-8 sm:py-12 px-4">
        <div className="mx-auto max-w-2xl">
          <FadeIn>
            <div className="rounded-3xl bg-surface shadow-xl border border-border/50 overflow-hidden">
              <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 sm:p-8">
                <p className="text-xs font-medium text-primary mb-1">Interview invitation</p>
                <h1 className="text-xl font-bold text-foreground">
                  {session?.jobTitle ?? "Loading interview…"}
                </h1>
                <p className="text-sm text-muted mt-1">{session?.organizationName}</p>
              </div>

              <div className="p-6 sm:p-8 space-y-6">
                {error ? (
                  <div className="rounded-xl border border-error/20 bg-error/5 p-4 text-sm text-error">
                    {error}
                  </div>
                ) : session ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <Info icon={Clock} label="Duration" value={`${session.estimatedDurationMinutes} minutes`} />
                      <Info icon={Globe} label="Language" value={session.language} />
                      <Info icon={Video} label="Format" value="AI video interview" />
                    </div>

                    <div className="rounded-xl bg-surface-elevated p-4">
                      <p className="text-[11px] font-medium text-muted uppercase tracking-wide">Candidate</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{session.candidateDisplayName}</p>
                    </div>

                    <div>
                      <h2 className="text-sm font-semibold text-foreground mb-3">Before you begin</h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {instructions.map((item) => (
                          <div key={item.label} className="flex items-center gap-2.5 rounded-xl bg-surface-elevated p-3">
                            <item.icon className="h-4 w-4 shrink-0 text-primary" />
                            <div>
                              <p className="text-xs font-semibold text-foreground">{item.label}</p>
                              <p className="text-[10px] text-muted">{item.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-10 text-center text-sm text-muted">Validating your interview…</div>
                )}

                <div className="flex gap-3">
                  <Link href="/candidate" className="flex-1">
                    <Button variant="outline" className="w-full h-12 rounded-xl">
                      <X className="h-4 w-4 mr-2" /> Cancel
                    </Button>
                  </Link>
                  <Link href="/candidate/interview/device-check" className="flex-1" aria-disabled={!session || !!error}>
                    <Button className="w-full h-12 rounded-xl" disabled={!session || !!error}>
                      Check device <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </CandidateLayout>
  )
}

function Info({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-surface-elevated p-3">
      <Icon className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-foreground mt-0.5 truncate">{value}</p>
      </div>
    </div>
  )
}
