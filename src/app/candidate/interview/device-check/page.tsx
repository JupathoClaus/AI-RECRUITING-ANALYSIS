"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { CandidateLayout } from "@/components/candidate/candidate-layout"
import { FadeIn } from "@/components/candidate/page-transition"
import { DeviceStatusCard } from "@/components/candidate/device-status-card"
import { CameraPreview } from "@/components/candidate/camera-preview"
import { Button } from "@/components/ui/button"
import { Video, Mic, Wifi, Globe, Shield, ArrowLeft, ArrowRight } from "lucide-react"

type DeviceStatus = "checking" | "ready" | "error" | "warning"

interface DeviceState {
  camera: DeviceStatus
  microphone: DeviceStatus
  internet: DeviceStatus
  browser: DeviceStatus
  permissions: DeviceStatus
}

export default function DeviceCheckPage() {
  const [devices, setDevices] = React.useState<DeviceState>({
    camera: "checking",
    microphone: "checking",
    internet: "checking",
    browser: "checking",
    permissions: "checking",
  })

  const allReady = Object.values(devices).every((s) => s === "ready")

  React.useEffect(() => {
    const checks: [keyof DeviceState, DeviceStatus, number][] = [
      ["browser", "ready", 600],
      ["internet", "ready", 900],
      ["camera", "ready", 1200],
      ["microphone", "ready", 1500],
      ["permissions", "ready", 1800],
    ]

    const timers = checks.map(([key, status, delay]) =>
      setTimeout(() => setDevices((prev) => ({ ...prev, [key]: status })), delay)
    )

    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <CandidateLayout>
      <div className="min-h-[calc(100vh-120px)] py-8 sm:py-12 px-4">
        <div className="mx-auto max-w-2xl">
          <FadeIn>
            <div className="rounded-3xl bg-surface shadow-xl border border-border/50 overflow-hidden">
              {/* Header */}
              <div className="p-6 sm:p-8 border-b border-border">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-foreground">Device Check</h1>
                    <p className="text-xs text-muted">Verify your setup before the interview</p>
                  </div>
                </div>
              </div>

              <div className="p-6 sm:p-8 space-y-6">
                {/* Camera Preview */}
                <CameraPreview />

                {/* Device Status Cards */}
                <div className="space-y-3">
                  <DeviceStatusCard
                    icon={<Video className="h-5 w-5 text-foreground" />}
                    label="Camera"
                    status={devices.camera}
                    detail={devices.camera === "ready" ? "HD Webcam detected" : undefined}
                  />
                  <DeviceStatusCard
                    icon={<Mic className="h-5 w-5 text-foreground" />}
                    label="Microphone"
                    status={devices.microphone}
                    detail={devices.microphone === "ready" ? "Built-in Microphone" : undefined}
                  />
                  <DeviceStatusCard
                    icon={<Wifi className="h-5 w-5 text-foreground" />}
                    label="Internet Connection"
                    status={devices.internet}
                    detail={devices.internet === "ready" ? "42 Mbps - Excellent" : undefined}
                  />
                  <DeviceStatusCard
                    icon={<Globe className="h-5 w-5 text-foreground" />}
                    label="Browser Compatibility"
                    status={devices.browser}
                    detail={devices.browser === "ready" ? "Chrome 128 - Supported" : undefined}
                  />
                  <DeviceStatusCard
                    icon={<Shield className="h-5 w-5 text-foreground" />}
                    label="Permissions"
                    status={devices.permissions}
                    detail={devices.permissions === "ready" ? "Camera & microphone access granted" : undefined}
                  />
                </div>

                {/* Status Summary */}
                {allReady && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl bg-success/5 border border-success/20 p-4 text-center"
                  >
                    <p className="text-sm font-semibold text-success">All systems ready</p>
                    <p className="text-xs text-success/70 mt-0.5">Your device is fully configured for the interview</p>
                  </motion.div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <Link href="/candidate/interview/details" className="flex-1">
                    <Button variant="outline" className="w-full h-12 rounded-xl">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                  </Link>
                  <Link href="/candidate/interview/session" className="flex-1">
                    <Button className="w-full h-12 rounded-xl" disabled={!allReady}>
                      Continue
                      <ArrowRight className="h-4 w-4 ml-2" />
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
