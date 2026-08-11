"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"

const instructions = [
  { icon: "🌐", text: "Use a stable internet connection" },
  { icon: "🔇", text: "Choose a quiet environment" },
  { icon: "💡", text: "Ensure good front-facing lighting" },
  { icon: "🎤", text: "Check that your microphone is working" },
  { icon: "📷", text: "Check that your camera is working" },
  { icon: "🌍", text: "Use a modern browser (Chrome, Firefox, or Edge)" },
  { icon: "⚡", text: "Close unnecessary bandwidth-heavy applications" },
  { icon: "🔌", text: "Keep your device connected to power" },
  { icon: "🚫", text: "Do not refresh or close the page during the interview" },
  { icon: "👤", text: "Complete the interview independently" },
]

const acknowledgements = [
  "I understand that this interview is conducted by an AI interviewer.",
  "I understand that my spoken answers may be transcribed and reviewed by authorized recruitment staff.",
  "I agree to allow camera and microphone access for the interview.",
  "I confirm that I am ready to complete the interview independently.",
]

export default function InterviewPreparationPage() {
  const router = useRouter()
  const accessToken = typeof window !== "undefined"
    ? sessionStorage.getItem("ai-interview-access-token")
    : null

  const [accepted, setAccepted] = React.useState<boolean[]>(
    acknowledgements.map(() => false)
  )

  const allAccepted = accepted.every(Boolean)

  React.useEffect(() => {
    if (!accessToken) {
      router.replace("/interview/access")
    }
  }, [accessToken, router])

  if (!accessToken) return null

  const toggleAcknowledgement = (index: number) => {
    setAccepted(prev => prev.map((v, i) => i === index ? !v : v))
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-6 flex flex-col items-center gap-2">
        <img src="/ai-recruiter-logo.png" alt="TalentAI" className="h-10 w-10 object-contain" />
        <span className="text-lg font-bold text-foreground">TalentAI</span>
      </div>

      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Before you begin</CardTitle>
          <CardDescription>
            Please review the following information to help you prepare for a successful interview.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            {instructions.map((item, i) => (
              <div key={i} className="flex items-start gap-3 text-sm text-foreground">
                <span className="text-base shrink-0">{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium text-foreground">
              Please acknowledge the following to continue:
            </p>
            {acknowledgements.map((text, i) => (
              <label key={i} className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={accepted[i]}
                  onCheckedChange={() => toggleAcknowledgement(i)}
                  className="mt-0.5"
                />
                <span className="text-sm text-muted">{text}</span>
              </label>
            ))}
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={!allAccepted}
            onClick={() => router.push("/interview/device-check")}
          >
            Check camera and microphone
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
