"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"

interface CandidateLayoutProps {
  children: React.ReactNode
  showNav?: boolean
}

export function CandidateLayout({ children, showNav = true }: CandidateLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {showNav && (
        <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
            <Link href="/candidate" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                <Image src="/ai-recruiter-logo.png" alt="AI Recruiter" width={24} height={24} className="object-contain" />
              </div>
              <span className="text-sm font-semibold text-foreground">AI Recruiter</span>
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Candidate Portal</span>
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
            </div>
          </div>
        </header>
      )}
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border py-6">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 text-center">
          <p className="text-xs text-muted">
            &copy; {new Date().getFullYear()} AI Recruiter. Powered by artificial intelligence.
          </p>
        </div>
      </footer>
    </div>
  )
}
