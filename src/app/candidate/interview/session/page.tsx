"use client"

import * as React from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { CandidateLayout } from "@/components/candidate/candidate-layout"
import { AIAvatar } from "@/components/candidate/ai-avatar"
import { QuestionCard } from "@/components/candidate/question-card"
import { ProgressIndicator } from "@/components/candidate/progress-indicator"
import { CameraPreview } from "@/components/candidate/camera-preview"
import { Button } from "@/components/ui/button"
import { mockQuestions, mockInterview } from "@/lib/candidate-mock-data"
import {
  Mic,
  MicOff,
  Send,
  ChevronLeft,
  ChevronRight,
  Clock,
  Wifi,
  StopCircle,
  Video,
  VideoOff,
} from "lucide-react"

export default function InterviewSessionPage() {
  const [currentIndex, setCurrentIndex] = React.useState(0)
  const [isRecording, setIsRecording] = React.useState(false)
  const [isThinking, setIsThinking] = React.useState(false)
  const [response, setResponse] = React.useState("")
  const [elapsedTime, setElapsedTime] = React.useState(0)
  const [cameraOn, setCameraOn] = React.useState(true)
  const [micOn, setMicOn] = React.useState(true)

  const question = mockQuestions[currentIndex]
  const totalQuestions = mockQuestions.length

  React.useEffect(() => {
    const timer = setInterval(() => setElapsedTime((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  React.useEffect(() => {
    setIsThinking(true)
    const t = setTimeout(() => setIsThinking(false), 1200)
    return () => clearTimeout(t)
  }, [currentIndex])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
  }

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1)
      setResponse("")
      setIsRecording(false)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1)
      setResponse("")
      setIsRecording(false)
    }
  }

  return (
    <CandidateLayout showNav={false}>
      <div className="min-h-screen bg-background">
        {/* Top Bar */}
        <div className="sticky top-0 z-50 border-b border-border bg-surface/90 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <img src={mockInterview.company.logoUrl} alt="" className="h-5 w-5 object-contain" />
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold text-foreground">{mockInterview.jobTitle}</p>
                <p className="text-[10px] text-muted">{mockInterview.company.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Clock className="h-3.5 w-3.5" />
                <span className="font-mono font-medium">{formatTime(elapsedTime)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                <Wifi className="h-3.5 w-3.5 text-success" />
              </div>
              <Link href="/candidate/interview/completed">
                <Button variant="ghost" size="sm" className="h-8 text-xs text-error hover:text-error hover:bg-error/5">
                  <StopCircle className="h-3.5 w-3.5 mr-1" />
                  End Interview
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: AI + Question */}
            <div className="lg:col-span-2 space-y-6">
              {/* Progress */}
              <ProgressIndicator current={currentIndex + 1} total={totalQuestions} />

              {/* AI Avatar */}
              <div className="flex justify-center">
                <AIAvatar
                  name={mockInterview.aiInterviewer.name}
                  isThinking={isThinking}
                  isSpeaking={!isThinking && !isRecording}
                  size="lg"
                />
              </div>

              {/* Question */}
              <AnimatePresence mode="wait">
                <QuestionCard
                  key={question.id}
                  questionNumber={question.id}
                  question={question.text}
                  category={question.category}
                />
              </AnimatePresence>

              {/* Response Area */}
              <div className="space-y-3">
                <div className="rounded-2xl bg-surface p-4">
                  <textarea
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    placeholder="Type your response here, or use voice recording..."
                    className="w-full h-24 resize-none bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
                  />
                </div>

                {/* Voice Controls */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-xl"
                      onClick={() => setCameraOn(!cameraOn)}
                    >
                      {cameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4 text-muted" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-xl"
                      onClick={() => setMicOn(!micOn)}
                    >
                      {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4 text-muted" />}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant={isRecording ? "destructive" : "outline"}
                      size="sm"
                      className="h-10 rounded-xl"
                      onClick={() => setIsRecording(!isRecording)}
                    >
                      <Mic className="h-4 w-4 mr-1.5" />
                      {isRecording ? "Stop Recording" : "Record Voice"}
                    </Button>
                    {response.trim() && (
                      <Button size="sm" className="h-10 rounded-xl">
                        <Send className="h-4 w-4 mr-1.5" />
                        Submit
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 rounded-xl"
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                {currentIndex === totalQuestions - 1 ? (
                  <Link href="/candidate/interview/completed">
                    <Button size="sm" className="h-10 rounded-xl">
                      Finish Interview
                    </Button>
                  </Link>
                ) : (
                  <Button size="sm" className="h-10 rounded-xl" onClick={handleNext}>
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>
            </div>

            {/* Right: Camera + Info */}
            <div className="space-y-4">
              <CameraPreview label="Your Camera" />

              {/* Interview Info */}
              <div className="rounded-2xl bg-surface p-4 space-y-3">
                <h3 className="text-xs font-semibold text-foreground">Interview Info</h3>
                <div className="space-y-2">
                  {[
                    { label: "Question", value: `${currentIndex + 1} / ${totalQuestions}` },
                    { label: "Elapsed", value: formatTime(elapsedTime) },
                    { label: "Interviewer", value: mockInterview.aiInterviewer.name },
                    { label: "Status", value: isRecording ? "Recording" : "Ready" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-xs text-muted">{item.label}</span>
                      <span className="text-xs font-medium text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tips */}
              <div className="rounded-2xl bg-primary/5 p-4">
                <h3 className="text-xs font-semibold text-primary mb-2">Interview Tips</h3>
                <ul className="space-y-1.5">
                  {[
                    "Take your time to think before answering",
                    "Speak clearly and at a natural pace",
                    "Look at the camera when speaking",
                    "It's okay to pause and gather your thoughts",
                  ].map((tip) => (
                    <li key={tip} className="flex items-start gap-1.5">
                      <div className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary/40" />
                      <span className="text-[11px] text-muted leading-relaxed">{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CandidateLayout>
  )
}
