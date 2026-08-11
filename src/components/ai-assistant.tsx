"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar } from "@/components/ui/avatar"
import { CloseSquare, Minus, Maximize, Send2, MagicStar } from "iconsax-react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

const WELCOME_MESSAGES: Message[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Hi! This is a preview of the AI Assistant. Actions are unavailable and no live data is shown here. I can point you to the features that already work — screening runs from the AI Screener or candidate dialogs, and interviews are scheduled from the Interviews page. How can I help you find the right tool?",
    timestamp: new Date(),
  },
]

// Static capability help only. These chips never trigger actions and the
// answers never claim to have executed anything.
const SUGGESTIONS = [
  "How do I run an AI screening?",
  "How do I schedule an interview?",
  "Where do I see hiring metrics?",
  "How do I send an AI interview?",
]

export function FloatingAIAssistant() {
  const [isOpen, setIsOpen] = React.useState(false)
  const [isMinimized, setIsMinimized] = React.useState(false)
  const [isExpanded, setIsExpanded] = React.useState(false)
  const [messages, setMessages] = React.useState<Message[]>(WELCOME_MESSAGES)
  const [input, setInput] = React.useState("")
  const [isTyping, setIsTyping] = React.useState(false)
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  React.useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus()
    }
  }, [isOpen, isMinimized])

  const handleSend = React.useCallback(() => {
    if (!input.trim()) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsTyping(true)

    setTimeout(() => {
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: generateHelpResponse(userMessage.content),
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])
      setIsTyping(false)
    }, 700)
  }, [input])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleSuggestion = React.useCallback((suggestion: string) => {
    setInput(suggestion)
    setTimeout(() => {
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: suggestion,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMessage])
      setIsTyping(true)

      setTimeout(() => {
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: generateHelpResponse(suggestion),
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, assistantMessage])
        setIsTyping(false)
      }, 700)
    }, 50)
  }, [])

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            "fixed bottom-6 right-6 z-50",
            "h-14 w-14 rounded-full",
            "bg-primary text-white shadow-lg shadow-primary/30",
            "flex items-center justify-center",
            "transition-all duration-300 ease-out",
            "hover:scale-110 hover:shadow-xl hover:shadow-primary/40",
            "active:scale-95",
            "group cursor-pointer"
          )}
          aria-label="Open AI Assistant preview"
        >
          <CpuIcon className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" />
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 flex flex-col",
            "border border-border bg-surface/80 backdrop-blur-xl",
            "shadow-2xl shadow-black/10 dark:shadow-black/30",
            "rounded-2xl overflow-hidden",
            "transition-all duration-300 ease-out",
            // Minimized state
            isMinimized
              ? "bottom-6 right-6 h-16 w-80"
              : isExpanded
                ? "bottom-0 right-0 h-[calc(100vh-3rem)] w-[calc(100vw-3rem)] sm:bottom-6 sm:right-6 sm:h-[640px] sm:w-[480px] sm:rounded-2xl"
                : "bottom-6 right-6 h-[600px] w-[420px] sm:w-[440px]",
            // Animation
            "animate-slide-in-from-right"
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border bg-surface/90 backdrop-blur-md px-4 py-3">
            <div className="relative">
              <Avatar className="h-9 w-9" fallback="AI" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground leading-none">AI Assistant</h3>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Preview — actions unavailable
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMinimized(!isMinimized)}
                className="h-8 w-8 rounded-lg"
                title="Minimize"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-8 w-8 rounded-lg hidden sm:inline-flex"
                title={isExpanded ? "Restore" : "Expand"}
              >
                <Maximize className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsOpen(false)
                  setIsMinimized(false)
                }}
                className="h-8 w-8 rounded-lg"
                title="Close"
              >
                <CloseSquare className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages (hidden when minimized) */}
          {!isMinimized && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-3 animate-fade-in",
                      msg.role === "user" ? "flex-row-reverse" : ""
                    )}
                  >
                    {msg.role === "assistant" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <MagicStar className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                        msg.role === "user"
                          ? "bg-primary text-white rounded-br-md"
                          : "bg-surface-elevated text-foreground border border-border rounded-bl-md"
                      )}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex gap-3 animate-fade-in">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <MagicStar className="h-4 w-4 text-primary" />
                    </div>
                    <div className="bg-surface-elevated border border-border rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-muted animate-bounce [animation-delay:0ms]" />
                        <span className="h-2 w-2 rounded-full bg-muted animate-bounce [animation-delay:150ms]" />
                        <span className="h-2 w-2 rounded-full bg-muted animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Suggestions (show only when few messages) */}
                {messages.length <= 1 && !isTyping && (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs text-muted text-center">Need help? Try these</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => handleSuggestion(s)}
                          className={cn(
                            "text-xs px-3 py-1.5 rounded-full",
                            "border border-border bg-surface hover:bg-surface-hover",
                            "text-muted-foreground hover:text-foreground",
                            "transition-colors duration-150",
                            "cursor-pointer"
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-border bg-surface/90 backdrop-blur-md p-3">
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask how to use a feature..."
                    className={cn(
                      "flex-1 h-10 rounded-xl px-4 text-sm",
                      "bg-surface-elevated border border-border",
                      "text-foreground placeholder:text-muted",
                      "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                      "transition-all duration-150"
                    )}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!input.trim() || isTyping}
                    size="icon"
                    className="h-10 w-10 rounded-xl shrink-0"
                    aria-label="Send message"
                  >
                    <Send2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted text-center mt-2">
                  Preview — static help only. No actions are executed and no live data is shown.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}

function CpuIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></svg>
}

// Static capability guidance. Never fabricates metrics and never claims that
// a screening, scheduling or analytics action was performed.
function generateHelpResponse(input: string): string {
  const lower = input.toLowerCase()

  if (lower.includes("screen") || lower.includes("resume")) {
    return "AI screening is available now. Open the AI Screener page (AI Tools → AI Screener) or add a candidate and choose “Start AI Screening” in the dialog. The score shown in candidate lists and the dashboard is the real score from the latest completed screening run."
  }
  if (lower.includes("schedule") || lower.includes("interview") && !lower.includes("ai interview")) {
    return "Interviews are scheduled from the Interviews page: pick a candidate and a job, choose a time and duration. Overlapping slots for the same candidate or interviewer are rejected automatically."
  }
  if (lower.includes("ai interview")) {
    return "AI interviews are sent from a candidate’s detail page using “Send AI Interview”. The AI Interviews page shows interviews created for your company."
  }
  if (lower.includes("metric") || lower.includes("analytics") || lower.includes("dashboard")) {
    return "Hiring metrics are shown on the Dashboard (candidate counts, interview counts, average AI score) and the Analytics page. This assistant is a preview and does not load or fabricate metric values."
  }
  if (lower.includes("job") || lower.includes("description")) {
    return "Job postings are managed on the Jobs page. You can create, publish, pause, close and reopen jobs there. Closing a job moves it out of the default Active view into the History view."
  }
  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return "Hello! This is a preview assistant — I can help you find the right tool in TalentAI, but I cannot run actions or show live data. Ask me how to screen, schedule, or review jobs."
  }
  if (lower.includes("thank")) {
    return "You're welcome! Remember: this assistant is a preview; screening, scheduling and reporting all happen in their dedicated pages."
  }
  return "I'm a preview assistant with static help content — no live data and no actions. Try asking how to run an AI screening, schedule an interview, or view hiring metrics."
}
