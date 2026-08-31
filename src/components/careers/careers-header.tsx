'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'

interface Props {
  companySlug?: string
  companyName?: string
}

/**
 * Branded public careers header shared by the candidate-facing pages:
 * AI Recruiter logo + wordmark, with the hiring company's name when known.
 */
export function CareersHeader({ companySlug, companyName }: Props) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:py-10">
        <div className="flex items-center justify-between gap-4 sm:justify-start">
          <Link href={companySlug ? `/careers/${encodeURIComponent(companySlug)}` : '/'} className="flex items-center gap-3">
            <Image
              src="/ai-recruiter-logo.png"
              alt="AI Recruiter"
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg object-contain"
              priority
            />
            <span className="text-base font-bold tracking-tight text-foreground">AI Recruiter</span>
          </Link>
          {companyName && (
            <span aria-hidden="true" className="hidden text-border sm:inline">/</span>
          )}
          {companyName && (
            <span className="text-sm font-medium capitalize text-muted sm:text-sm">{companyName}</span>
          )}
        </div>
        {companySlug && (
          <nav>
            <Link
              href={`/careers/${encodeURIComponent(companySlug)}`}
              className="text-sm font-medium text-primary hover:text-primary-hover"
            >
              View all open roles
            </Link>
          </nav>
        )}
      </div>
    </header>
  )
}