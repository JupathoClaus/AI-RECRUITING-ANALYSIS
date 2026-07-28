"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { CandidateLayout } from "@/components/candidate/candidate-layout"
import { FadeIn } from "@/components/candidate/page-transition"
import { Button } from "@/components/ui/button"
import { mockInterview } from "@/lib/candidate-mock-data"
import {
  Calendar,
  Clock,
  CircleHelp,
  Video,
  Mic,
  Wifi,
  Shield,
  ArrowRight,
  X,
} from "lucide-react"

const instructions = [
  { icon: Video, label: "Camera Required", desc: "Ensure your camera is working" },
  { icon: Mic, label: "Microphone Required", desc: "A working mic is needed" },
  { icon: Wifi, label: "Stable Internet", desc: "Connect to a reliable network" },
  { icon: Shield, label: "Quiet Environment", desc: "Find a distraction-free space" },
]

export default function InterviewDetailsPage() {
  const interview = mockInterview

  return (
    <CandidateLayout>
      <div className="min-h-[calc(100vh-120px)] py-8 sm:py-12 px-4">
        <div className="mx-auto max-w-2xl">
          <FadeIn>
            <div className="rounded-3xl bg-surface shadow-xl border border-border/50 overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <img
                      src={interview.company.logoUrl}
                      alt={interview.company.name}
                      className="h-10 w-10 object-contain"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-primary mb-1">Interview Confirmed</p>
                    <h1 className="text-xl font-bold text-foreground">{interview.jobTitle}</h1>
                    <p className="text-sm text-muted mt-1">{interview.company.name}</p>
                  </div>
                </div>
              </div>

              {/* Details Grid */}
              <div className="p-6 sm:p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { icon: Calendar, label: "Date", value: interview.interviewDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) },
                    { icon: Clock, label: "Duration", value: interview.duration },
                    { icon: CircleHelp, label: "Questions", value: `${interview.totalQuestions} questions` },
                    { icon: Video, label: "AI Interviewer", value: interview.aiInterviewer.name },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3 rounded-xl bg-surface-elevated p-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <item.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-muted uppercase tracking-wide">{item.label}</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5 truncate">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Recruiter */}
                <div className="rounded-xl bg-surface-elevated p-4">
                  <p className="text-[11px] font-medium text-muted uppercase tracking-wide mb-2">Recruiter</p>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {interview.recruiter.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{interview.recruiter.name}</p>
                      <p className="text-xs text-muted">{interview.recruiter.email}</p>
                    </div>
                  </div>
                </div>

                {/* Instructions */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">Before You Begin</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {instructions.map((inst) => (
                      <div key={inst.label} className="flex items-center gap-2.5 rounded-xl bg-surface-elevated p-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <inst.icon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground">{inst.label}</p>
                          <p className="text-[10px] text-muted">{inst.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Code */}
                <div className="rounded-xl bg-surface-elevated p-4 text-center">
                  <p className="text-[11px] font-medium text-muted uppercase tracking-wide mb-1">Interview Code</p>
                  <p className="text-lg font-mono font-bold text-primary tracking-wider">{interview.code}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Link href="/candidate" className="flex-1">
                    <Button variant="outline" className="w-full h-12 rounded-xl">
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  </Link>
                  <Link href="/candidate/interview/device-check" className="flex-1">
                    <Button className="w-full h-12 rounded-xl">
                      Start Interview
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
