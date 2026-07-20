"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Eye, EyeOff, ArrowLeft } from "lucide-react"

export default function LoginPage() {
  const { user, login } = useAuth()
  const router = useRouter()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [showPassword, setShowPassword] = React.useState(false)
  const [error, setError] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (user) router.replace("/dashboard")
  }, [user, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSubmitting(true)

    const result = await login(email, password)
    if (result.error) {
      setError(result.error)
      setSubmitting(false)
    } else {
      router.replace("/dashboard")
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left: Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5" />
        <div className="relative flex flex-col justify-between p-12 w-full">
          <Link href="/" className="flex items-center">
            <div className="flex h-[150px] w-[150px] items-center justify-center rounded-xl overflow-hidden">
              <img src="/ai-recruiter-logo.png" alt="AI Recruiter" className="h-full w-full object-contain" />
            </div>
          </Link>
          <div>
            <h2 className="text-4xl font-bold tracking-tight text-foreground leading-tight">
              Welcome back to
              <br />
              <span className="text-primary">AI Recruiter</span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-md leading-relaxed">
              Sign in to access your recruitment dashboard, manage candidates, and track your hiring pipeline.
            </p>
            <div className="mt-8 flex items-center gap-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-1.5 w-1.5 rounded-full bg-success" />
                99.9% uptime
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-1.5 w-1.5 rounded-full bg-success" />
                SOC 2 compliant
              </div>
            </div>
          </div>
          <p className="text-sm text-muted">
            &copy; {new Date().getFullYear()} AI Recruiter. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right: Form */}
      <div className="flex flex-1 flex-col justify-center px-6 sm:px-12 lg:px-16">
        <div className="w-full max-w-md mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to home
          </Link>

          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Sign in</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your credentials to access your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="font-medium text-primary hover:text-primary/80 transition-colors">
                Create one
              </Link>
            </p>
          </div>

          <div className="mt-8 rounded-lg border border-border bg-surface/50 p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Demo credentials</p>
            <div className="space-y-1 text-xs text-muted font-mono">
              <p>Email: sarah@airecruiter.com</p>
              <p>Password: admin123</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
