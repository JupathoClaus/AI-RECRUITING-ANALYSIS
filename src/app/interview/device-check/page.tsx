"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { startAiInterview } from "@/lib/api/ai-interviews.api"
import { ApiErrorResponse } from "@/lib/api/client"
import { clearInterviewSession } from "@/lib/interview-session"
import { InterviewShell } from "@/components/interview/interview-shell"
import {
  Camera,
  Mic,
  Wifi,
  MonitorSmartphone,
  RefreshCw,
  Loader2,
  Video,
  ArrowRight,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"

type DeviceStatus = "checking" | "available" | "denied" | "unavailable"

const PERMISSION_RECOVERY = [
  "Click the lock or camera icon in your browser's address bar.",
  "Allow camera and microphone access for this site.",
  "Reload this page, then click Retry.",
]

export default function InterviewDeviceCheckPage() {
  const router = useRouter()
  const accessToken = React.useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : sessionStorage.getItem("ai-interview-access-token"),
    [],
  )

  const videoRef = React.useRef<HTMLVideoElement>(null)
  const mediaStreamRef = React.useRef<MediaStream | null>(null)

  const [cameraStatus, setCameraStatus] = React.useState<DeviceStatus>("checking")
  const [micStatus, setMicStatus] = React.useState<DeviceStatus>("checking")
  const [browserSupported, setBrowserSupported] = React.useState<boolean | null>(null)
  const [isOnline, setIsOnline] = React.useState(true)
  const [cameraError, setCameraError] = React.useState("")
  const [micError, setMicError] = React.useState("")
  const [startLoading, setStartLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  const stopMediaTracks = React.useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const friendlyMediaError = React.useCallback(
    (err: unknown, kind: "camera" | "mic"): string => {
      if (err instanceof DOMException || (err as { name?: string })?.name) {
        const name = (err as DOMException).name
        if (name === "NotAllowedError") {
          return "Permission was blocked. Allow access in your browser and try again."
        }
        if (name === "NotFoundError") {
          return `No ${kind} was found on this device.`
        }
        if (name === "NotReadableError") {
          return `Your ${kind} is in use by another application. Close it and retry.`
        }
        if (name === "OverconstrainedError") {
          return `Your ${kind} could not match the required settings.`
        }
        if (name === "AbortError") {
          return `The ${kind} check was interrupted. Retry.`
        }
      }
      return `We couldn't access your ${kind}. Retry or check your device.`
    },
    [],
  )

  const checkDevices = React.useCallback(async () => {
    setCameraError("")
    setMicError("")
    stopMediaTracks()

    const mediaSupported =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      !!navigator.mediaDevices.getUserMedia
    setBrowserSupported(mediaSupported)
    if (!mediaSupported) {
      setCameraStatus("unavailable")
      setMicStatus("unavailable")
      return
    }

    let hasVideo = false
    let hasAudio = false
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      hasVideo = devices.some((d) => d.kind === "videoinput")
      hasAudio = devices.some((d) => d.kind === "audioinput")
    } catch {
      hasVideo = true
      hasAudio = true
    }

    if (!hasVideo) {
      setCameraStatus("unavailable")
      setCameraError("No camera was found on this device.")
    }
    if (!hasAudio) {
      setMicStatus("unavailable")
      setMicError("No microphone was found on this device.")
    }

    if (hasVideo) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        mediaStreamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setCameraStatus("available")
      } catch (err) {
        setCameraStatus("denied")
        setCameraError(friendlyMediaError(err, "camera"))
      }
    }

    if (hasAudio) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true })
        if (!mediaStreamRef.current) {
          mediaStreamRef.current = stream
        } else {
          stream.getAudioTracks().forEach((t) => mediaStreamRef.current?.addTrack(t))
        }
        setMicStatus("available")
      } catch (err) {
        setMicStatus("denied")
        setMicError(friendlyMediaError(err, "mic"))
      }
    }
  }, [friendlyMediaError, stopMediaTracks])

  React.useEffect(() => {
    if (!accessToken) {
      router.replace("/interview/access")
      return
    }

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    queueMicrotask(() => void checkDevices())

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      stopMediaTracks()
    }
  }, [accessToken, router, checkDevices, stopMediaTracks])

  const canStart =
    cameraStatus === "available" &&
    micStatus === "available" &&
    browserSupported !== false &&
    isOnline &&
    !startLoading

  const handleStart = async () => {
    if (!canStart || !accessToken) return
    setStartLoading(true)
    setError("")

    try {
      stopMediaTracks()
      const accommodationRequested =
        sessionStorage.getItem("ai-interview-accommodation") === "yes"
      const accommodationNotes =
        sessionStorage.getItem("ai-interview-accommodation-notes") || undefined
      const result = await startAiInterview(accessToken, {
        acknowledgementsAccepted: true,
        accommodationRequested,
        accommodationNotes,
      })
      sessionStorage.setItem("ai-interview-conversation-url", result.conversationUrl)
      sessionStorage.setItem("ai-interview-conversation-id", result.conversationId)
      sessionStorage.setItem("ai-interview-meeting-token", result.meetingToken || "")
      sessionStorage.setItem("ai-interview-provider", result.provider)
      router.push("/interview/session")
    } catch (err: unknown) {
      let message = "We couldn't start your interview right now. Please try again shortly."
      if (err instanceof ApiErrorResponse) {
        switch (err.errorCode) {
          case "INTERVIEW_COMPLETED":
            message = "This interview has already been completed."
            break
          case "INTERVIEW_UNAVAILABLE":
            message = "This interview is no longer available."
            break
          case "INTERVIEW_EXPIRED":
            message = "This interview invitation has expired."
            break
          case "ACKNOWLEDGEMENT_REQUIRED":
            message = "Please go back and complete the required confirmations."
            break
          case "CODE_VERSION_MISMATCH":
            message = "Your interview code changed. Please re-enter it."
            clearInterviewSession()
            router.replace("/interview/access")
            break
          default:
            message = "We couldn't start your interview right now. Please try again shortly."
        }
      }
      setError(message)
    } finally {
      setStartLoading(false)
    }
  }

  if (!accessToken) return null

  const statusPill = (status: DeviceStatus, label: string) => {
    if (status === "checking") {
      return (
        <Badge variant="outline" className="gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          Checkingâ€¦
        </Badge>
      )
    }
    if (status === "available") {
      return (
        <Badge variant="success" className="gap-1.5">
          <CheckCircle2 className="h-3 w-3" />
          Ready
        </Badge>
      )
    }
    if (status === "denied") {
      return (
        <Badge variant="error" className="gap-1.5">
          <XCircle className="h-3 w-3" />
          Needs permission
        </Badge>
      )
    }
    return (
      <Badge variant="error" className="gap-1.5">
        <XCircle className="h-3 w-3" />
        {label}
      </Badge>
    )
  }

  const anyDeviceIssue = cameraStatus === "denied" || micStatus === "denied"

  return (
    <InterviewShell step={3} stepCount={4} stepLabels={["Welcome", "Instructions", "Device check", "Interview"]}>
      <Card className="overflow-hidden shadow-card">
        <div className="border-b border-border/60 bg-gradient-to-b from-primary-subtle to-transparent px-6 pb-6 pt-7 sm:px-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Device check</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            We need to verify your camera, microphone, and connection before the interview starts.
          </p>
        </div>

        <CardContent className="px-6 py-6 sm:px-8">
          <div
            className={cn(
              "relative aspect-video overflow-hidden rounded-xl bg-foreground/5 ring-1 ring-border",
              cameraStatus === "available" && "ring-success/40",
            )}
          >
            {cameraStatus === "available" ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                  aria-label="Camera preview"
                />
                <span className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white">
                  <Video className="h-3 w-3" />
                  Camera preview
                </span>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
                {cameraStatus === "checking" ? (
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                ) : (
                  <Camera className="h-8 w-8 text-muted/60" />
                )}
                <p className="text-xs">
                  {cameraStatus === "checking"
                    ? "Requesting camera accessâ€¦"
                    : "Camera preview unavailable"}
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2.5">
            <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3.5 py-2.5">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Camera className="h-4 w-4 text-primary" />
                Camera
              </span>
              {statusPill(cameraStatus, "Not found")}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3.5 py-2.5">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Mic className="h-4 w-4 text-primary" />
                Microphone
              </span>
              {statusPill(micStatus, "Not found")}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3.5 py-2.5">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Wifi className="h-4 w-4 text-primary" />
                Connection
              </span>
              {isOnline ? (
                <Badge variant="success" className="gap-1.5">
                  <CheckCircle2 className="h-3 w-3" />
                  Ready
                </Badge>
              ) : (
                <Badge variant="error" className="gap-1.5">
                  <XCircle className="h-3 w-3" />
                  Offline
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3.5 py-2.5">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <MonitorSmartphone className="h-4 w-4 text-primary" />
                Browser
              </span>
              {browserSupported === false ? (
                <Badge variant="error" className="gap-1.5">
                  <XCircle className="h-3 w-3" />
                  Unsupported
                </Badge>
              ) : (
                <Badge variant="success" className="gap-1.5">
                  <CheckCircle2 className="h-3 w-3" />
                  Supported
                </Badge>
              )}
            </div>
          </div>

          {(cameraError || micError) && (
            <div className="mt-3 space-y-2 rounded-lg bg-error-muted px-3.5 py-3 text-xs text-error">
              {cameraError && <p className="flex items-start gap-2"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{cameraError}</p>}
              {micError && <p className="flex items-start gap-2"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{micError}</p>}
            </div>
          )}

          {anyDeviceIssue && (
            <div className="mt-3 rounded-lg bg-surface-elevated px-3.5 py-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <HelpCircle className="h-3.5 w-3.5 text-primary" />
                How to fix permission issues
              </p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-xs text-muted">
                {PERMISSION_RECOVERY.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-lg bg-error-muted px-3.5 py-3 text-sm text-error" role="alert">
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => void checkDevices()}
              disabled={startLoading}
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
            <Button className="flex-1" disabled={!canStart} onClick={handleStart}>
              {startLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting interviewâ€¦
                </>
              ) : (
                <>
                  Start AI Interview
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
          {!canStart && !startLoading && (
            <p className="mt-3 text-center text-xs text-muted">
              {browserSupported === false
                ? "Please use a modern browser such as Chrome, Edge, or Firefox."
                : cameraStatus !== "available" || micStatus !== "available"
                  ? "Camera and microphone must be ready to start the interview."
                  : !isOnline
                    ? "You need an internet connection to start the interview."
                    : "Waiting for device check to completeâ€¦"}
            </p>
          )}
        </CardContent>
      </Card>
    </InterviewShell>
  )
}
