"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface QuestionCardProps {
  questionNumber: number
  question: string
  category?: string
  className?: string
}

export function QuestionCard({ questionNumber, question, category, className }: QuestionCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn("rounded-2xl bg-surface p-6 sm:p-8", className)}
    >
      <div className="space-y-4">
        {category && (
          <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {category}
          </span>
        )}
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {questionNumber}
          </div>
          <p className="text-base sm:text-lg font-medium text-foreground leading-relaxed">
            {question}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
