"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import {
  Brain,
  Sparkles,
  Users,
  BarChart3,
  Calendar,
  Shield,
  ArrowRight,
  CheckCircle2,
  Zap,
  GitBranch,
  FileText,
} from "lucide-react"

const features = [
  {
    icon: Sparkles,
    title: "AI-Powered Screening",
    description: "Automatically rank and filter candidates with intelligent resume analysis and skill matching.",
  },
  {
    icon: Users,
    title: "Candidate Pipeline",
    description: "Visual Kanban board to track candidates through every stage of your hiring workflow.",
  },
  {
    icon: Calendar,
    title: "Smart Scheduling",
    description: "AI-driven interview scheduling that finds the best times for interviewers and candidates.",
  },
  {
    icon: BarChart3,
    title: "Analytics & Insights",
    description: "Real-time dashboards with hiring metrics, pipeline health, and source effectiveness.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Role-based access control, audit logs, and SOC 2 compliant data handling.",
  },
  {
    icon: Zap,
    title: "Automated Workflows",
    description: "Eliminate repetitive tasks with automated notifications, scoring, and report generation.",
  },
]

const stats = [
  { value: "10x", label: "Faster Screening" },
  { value: "94%", label: "Candidate Satisfaction" },
  { value: "60%", label: "Less Time-to-Hire" },
  { value: "3x", label: "More Qualified Leads" },
]

export default function LandingPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard")
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (user) return null

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm">
              <Brain className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">AI Recruiter</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 py-24 sm:py-32 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-8">
            <Sparkles className="h-3.5 w-3.5" />
            AI-Powered Recruitment Platform
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
            Hire the best talent,
            <br />
            <span className="text-primary">powered by AI</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Streamline your recruitment workflow with intelligent candidate screening,
            automated scheduling, and real-time analytics — all in one platform.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="text-base px-8 gap-2">
                Start Hiring Smarter
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="text-base px-8">
                Sign In to Dashboard
              </Button>
            </Link>
          </div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-12">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl sm:text-4xl font-bold text-foreground">{stat.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-surface/50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Everything you need to hire
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              From sourcing to onboarding, AI Recruiter gives your team the tools to find and hire exceptional talent.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl border border-border bg-background p-6 transition-all duration-200 hover:shadow-lg hover:border-primary/20"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4 transition-transform duration-200 group-hover:scale-110">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Ready to transform your hiring?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
            Join hundreds of companies using AI Recruiter to build exceptional teams faster.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="text-base px-8 gap-2">
                Create Free Account
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
              <Brain className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-foreground">AI Recruiter</span>
          </div>
          <p className="text-sm text-muted">
            &copy; {new Date().getFullYear()} AI Recruiter. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
