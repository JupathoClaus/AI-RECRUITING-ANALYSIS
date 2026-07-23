"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { Cpu, CloseSquare, Minus, Maximize, Send2, MagicStar } from "iconsax-react"

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
    content: "Hi! I'm your AI Hiring Assistant. I can help you with candidate screening, interview scheduling, job posting optimization, and recruitment analytics. How can I help you today?",
    timestamp: new Date(),
  },
]

const SUGGESTIONS = [
  "Screen a candidate for me",
  "Schedule an interview",
  "Show hiring analytics",
  "Review job descriptions",
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
        content: generateResponse(userMessage.content),
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])
      setIsTyping(false)
    }, 1200 + Math.random() * 800)
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
          content: generateResponse(suggestion),
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, assistantMessage])
        setIsTyping(false)
      }, 1200 + Math.random() * 800)
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
          aria-label="Open AI Assistant"
        >
          <Cpu className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" />
          <span className="absolute -right-1 -top-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500 border-2 border-surface" />
          </span>
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
              <Avatar className="h-9 w-9" fallback="AI">
                <AvatarImage src="/avatars/ai-assistant.jpg" alt="AI Assistant" />
              </Avatar>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-surface" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground leading-none">AI Hiring Assistant</h3>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
                Online
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
                    <p className="text-xs text-muted text-center">Suggested questions</p>
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
                    placeholder="Ask about candidates, interviews, jobs..."
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
                  >
                    <Send2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted text-center mt-2">
                  AI-powered recruitment assistant
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}

function generateResponse(input: string): string {
  const lower = input.toLowerCase()

  if (lower.includes("screen") && lower.includes("candidate")) {
    return "I'd be happy to help you screen a candidate! To get started, I can analyze resumes, evaluate skills match against job requirements, and provide an AI-generated compatibility score. Which candidate would you like me to screen, and for which position?"
  }
  if (lower.includes("schedule") && lower.includes("interview")) {
    return "Let me help you schedule an interview! I can find available time slots, send calendar invites, and prepare interview questions based on the role. Which candidate are you scheduling for, and what type of interview would you prefer (Technical, Behavioral, or Culture Fit)?"
  }
  if (lower.includes("analytics") || lower.includes("hiring")) {
    return "Here's a quick overview of your hiring metrics: You have 12 active job openings with 47 candidates in the pipeline. Your average time-to-hire is 18 days (down 12% from last month). Top performing source: LinkedIn referrals at 34% conversion rate. Would you like me to dive deeper into any specific metric?"
  }
  if (lower.includes("job") && (lower.includes("description") || lower.includes("review") || lower.includes("optimize"))) {
    return "I can help you review and optimize job descriptions! I'll analyze clarity, inclusivity, required vs nice-to-have skills, and market competitiveness. Which job posting would you like me to review?"
  }
  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return "Hello! Welcome to the AI Hiring Assistant. I can help you with candidate screening, interview scheduling, job posting optimization, and recruitment analytics. What would you like to work on today?"
  }
  if (lower.includes("thank")) {
    return "You're welcome! Feel free to ask if you need any more help with your recruitment process. I'm always here to assist!"
  }
  return "Great question! I can help you with candidate screening, interview scheduling, job posting optimization, and hiring analytics. Could you provide more details about what you need? For example, I can analyze a specific candidate's profile, suggest interview questions for a role, or pull up your recruitment funnel metrics."
}
