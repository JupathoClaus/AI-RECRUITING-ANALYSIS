"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CandidateLayout } from "@/components/candidate/candidate-layout"
import { FadeIn } from "@/components/candidate/page-transition"
import { DeviceStatusCard } from "@/components/candidate/device-status-card"
import { Button } from "@/components/ui/button"
import { startAiInterview } from "@/lib/api/ai-interviews.api"
import { ApiErrorResponse } from "@/lib/api/client"
import { loadCandidateInterviewSession } from "@/lib/candidate-interview-session"
import { Video, Mic, Wifi, Globe, ArrowLeft, ArrowRight } from "lucide-react"

type DeviceStatus = "checking" | "ready" | "error" | "warning"

export default function DeviceCheckPage() {
  const router = useRouter()
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const [mediaStatus, setMediaStatus] = React.useState<DeviceStatus>("checking")
  const [accepted, setAccepted] = React.useState(false)
  const [starting, setStarting] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (!loadCandidateInterviewSession()) {
      router.replace("/candidate")
      return
    }

    navigator.mediaDevices?.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setMediaStatus("ready")
      })
      .catch(() => setMediaStatus("error"))

    return () => streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [router])

  const handleStart = async () => {
    const session = loadCandidateInterviewSession()
    if (!session) {
      router.replace("/candidate")
      return
    }

    setStarting(true)
    setError("")
    try {
      const started = await startAiInterview(session.accessToken, accepted)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      if (started.provider === "MOCK") {
        router.push("/candidate/interview/session")
      } else {
        const conversationUrl = new URL(started.conversationUrl)
        if (started.meetingToken) conversationUrl.searchParams.set("t", started.meetingToken)
        window.location.assign(conversationUrl.toString())
      }
    } catch (cause) {
      setError(cause instanceof ApiErrorResponse ? cause.message : "The interview could not be started. Please try again.")
      setStarting(false)
    }
  }

  const browserReady = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia
  const online = typeof navigator === "undefined" || navigator.onLine
  const allReady = mediaStatus === "ready" && browserReady && online

  return (
    <CandidateLayout>
      <div className="min-h-[calc(100vh-120px)] py-8 sm:py-12 px-4">
        <div className="mx-auto max-w-2xl">
          <FadeIn>
            <div className="rounded-3xl bg-surface shadow-xl border border-border/50 overflow-hidden">
              <div className="p-6 sm:p-8 border-b border-border">
                <h1 className="text-lg font-bold text-foreground">Device check</h1>
                <p className="text-xs text-muted">Allow camera and microphone access to verify your setup.</p>
              </div>

              <div className="p-6 sm:p-8 space-y-6">
                <div className="aspect-video overflow-hidden rounded-2xl bg-slate-950">
                  <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
                </div>

                <div className="space-y-3">
                  <DeviceStatusCard icon={<Video className="h-5 w-5" />} label="Camera" status={mediaStatus} detail={mediaStatus === "ready" ? "Camera access granted" : undefined} />
                  <DeviceStatusCard icon={<Mic className="h-5 w-5" />} label="Microphone" status={mediaStatus} detail={mediaStatus === "ready" ? "Microphone access granted" : undefined} />
                  <DeviceStatusCard icon={<Wifi className="h-5 w-5" />} label="Internet connection" status={online ? "ready" : "error"} detail={online ? "Browser is online" : "No connection detected"} />
                  <DeviceStatusCard icon={<Globe className="h-5 w-5" />} label="Browser compatibility" status={browserReady ? "ready" : "error"} detail={browserReady ? "Media devices supported" : "Use a modern browser with camera support"} />
                </div>

                {mediaStatus === "error" && (
                  <p className="rounded-xl border border-error/20 bg-error/5 p-4 text-sm text-error">
                    Camera or microphone access was denied or unavailable. Update your browser permissions and reload this page.
                  </p>
                )}

                <label className="flex items-start gap-3 rounded-xl bg-surface-elevated p-4 text-sm text-foreground">
                  <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5" />
                  <span>I consent to this AI-assisted video interview and understand that the session may be recorded and reviewed by the hiring team.</span>
                </label>

                {error && <p className="rounded-xl border border-error/20 bg-error/5 p-4 text-sm text-error">{error}</p>}

                <div className="flex gap-3">
                  <Link href="/candidate/interview/details" className="flex-1">
                    <Button variant="outline" className="w-full h-12 rounded-xl">
                      <ArrowLeft className="h-4 w-4 mr-2" /> Back
                    </Button>
                  </Link>
                  <Button className="flex-1 h-12 rounded-xl" disabled={!allReady || !accepted || starting} onClick={handleStart}>
                    {starting ? "Starting…" : "Begin interview"} <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </CandidateLayout>
  )
}
