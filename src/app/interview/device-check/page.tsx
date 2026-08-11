"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { startAiInterview } from "@/lib/api/ai-interviews.api"

type DeviceStatus = "checking" | "available" | "denied" | "unavailable"

export default function InterviewDeviceCheckPage() {
  const router = useRouter()
  const accessToken = typeof window !== "undefined"
    ? sessionStorage.getItem("ai-interview-access-token")
    : null

  const videoRef = React.useRef<HTMLVideoElement>(null)
  const mediaStreamRef = React.useRef<MediaStream | null>(null)

  const [cameraStatus, setCameraStatus] = React.useState<DeviceStatus>("checking")
  const [micStatus, setMicStatus] = React.useState<DeviceStatus>("checking")
  const [isOnline, setIsOnline] = React.useState(true)
  const [startLoading, setStartLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  const stopMediaTracks = React.useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const checkDevices = React.useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      setCameraStatus("unavailable")
      setMicStatus("unavailable")
      return
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const hasVideo = devices.some(d => d.kind === "videoinput")
      const hasAudio = devices.some(d => d.kind === "audioinput")

      if (!hasVideo) setCameraStatus("unavailable")
      if (!hasAudio) setMicStatus("unavailable")

      if (hasVideo) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          mediaStreamRef.current = stream
          if (videoRef.current) videoRef.current.srcObject = stream
          setCameraStatus("available")
        } catch {
          setCameraStatus("denied")
        }
      }

      if (hasAudio) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true })
          if (!mediaStreamRef.current) {
            mediaStreamRef.current = stream
          } else {
            stream.getAudioTracks().forEach(t => mediaStreamRef.current?.addTrack(t))
          }
          setMicStatus("available")
        } catch {
          setMicStatus("denied")
        }
      }
    } catch {
      setCameraStatus("unavailable")
      setMicStatus("unavailable")
    }
  }, [])

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
    isOnline &&
    !startLoading

  const handleStart = async () => {
    if (!canStart || !accessToken) return
    setStartLoading(true)
    setError("")

    try {
      stopMediaTracks()
      const result = await startAiInterview(accessToken, true)
      sessionStorage.setItem("ai-interview-conversation-url", result.conversationUrl)
      sessionStorage.setItem("ai-interview-conversation-id", result.conversationId)
      sessionStorage.setItem("ai-interview-meeting-token", result.meetingToken || "")
      sessionStorage.setItem("ai-interview-provider", result.provider)
      router.push("/interview/session")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start interview"
      setError(message)
    } finally {
      setStartLoading(false)
    }
  }

  if (!accessToken) return null

  const statusBadge = (status: DeviceStatus) => {
    switch (status) {
      case "checking": return <Badge variant="outline">Checking...</Badge>
      case "available": return <Badge variant="success">Available</Badge>
      case "denied": return <Badge variant="error">Permission denied</Badge>
      case "unavailable": return <Badge variant="error">Not found</Badge>
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-6 flex flex-col items-center gap-2">
        <img src="/ai-recruiter-logo.png" alt="TalentAI" className="h-10 w-10 object-contain" />
        <span className="text-lg font-bold text-foreground">TalentAI</span>
      </div>

      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Camera and microphone check</CardTitle>
          <CardDescription>
            We need to verify your camera and microphone before the interview.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="aspect-video rounded-lg bg-surface overflow-hidden">
            {cameraStatus === "available" ? (
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                Camera preview unavailable
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Camera</span>
              {statusBadge(cameraStatus)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Microphone</span>
              {statusBadge(micStatus)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Internet connection</span>
              {isOnline ? <Badge variant="success">Connected</Badge> : <Badge variant="error">Offline</Badge>}
            </div>
          </div>

          {(cameraStatus === "denied" || micStatus === "denied") && (
            <p className="text-sm text-muted">
              Please allow camera and microphone access in your browser settings, then click Retry.
            </p>
          )}

          {error && <p className="text-sm text-error">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={checkDevices}>
              Retry
            </Button>
            <Button className="flex-1" disabled={!canStart} onClick={handleStart}>
              {startLoading ? "Starting interview..." : "Start Interview"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
