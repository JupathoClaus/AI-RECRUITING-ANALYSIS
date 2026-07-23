"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Eye, EyeOff, ArrowLeft, CheckCircle2 } from "lucide-react"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"

export default function RegisterPage() {
  const { user, register } = useAuth()
  const router = useRouter()
  const [companyName, setCompanyName] = React.useState("")
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [showPassword, setShowPassword] = React.useState(false)
  const [acceptTerms, setAcceptTerms] = React.useState(false)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [error, setError] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [successData, setSuccessData] = React.useState<{ verificationRequired: boolean } | null>(null)

  React.useEffect(() => {
    if (user) router.replace("/dashboard")
  }, [user, router])

  const validate = (): boolean => {
    const errors: Record<string, string> = {}
    if (!companyName.trim()) errors.companyName = "Company name is required"
    if (!firstName.trim()) errors.firstName = "First name is required"
    if (!lastName.trim()) errors.lastName = "Last name is required"
    if (!email.trim()) {
      errors.email = "Email is required"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = "Invalid email format"
    }
    if (!password) {
      errors.password = "Password is required"
    } else if (password.length < 12) {
      errors.password = "Password must be at least 12 characters"
    }
    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your password"
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match"
    }
    if (!acceptTerms) errors.acceptTerms = "You must accept the terms and conditions"
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!validate()) return
    setSubmitting(true)

    const result = await register({
      companyName: companyName.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      password,
      passwordConfirmation: confirmPassword,
      acceptTerms,
    })

    if (result.error) {
      setError(result.error)
      setSubmitting(false)
    } else if (result.data) {
      setSuccessData({
        verificationRequired: result.data.verificationRequired,
      })
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left: Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5" />
        <div className="relative flex flex-col justify-between p-12 w-full">
          <Link href="/" className="flex items-center">
            <div className="flex h-[150px] w-[150px] items-center justify-center overflow-hidden">
              <img src="/ai-recruiter-logo.png" alt="AI Recruiter" className="h-full w-full object-contain" />
            </div>
          </Link>
          <div>
            <h2 className="text-4xl font-bold tracking-tight text-foreground leading-tight">
              Start building your
              <br />
              <span className="text-primary">dream team</span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-md leading-relaxed">
              Create your account and start leveraging AI to find, evaluate, and hire the best candidates.
            </p>
            <div className="mt-8 space-y-3">
              {["AI-powered candidate screening", "Automated interview scheduling", "Real-time hiring analytics"].map((item) => (
                <div key={item} className="flex items-center gap-2.5 text-sm text-foreground/70">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
                    <svg className="h-3 w-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  {item}
                </div>
              ))}
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
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Create account</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Set up your team account to get started
            </p>
          </div>

          {successData ? (
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-6">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground mb-3">
                Account created successfully!
              </h2>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Please verify your email address before signing in. We&apos;ve sent a verification link to{" "}
                <span className="font-medium text-foreground">{email}</span>.
              </p>
              <Link href="/login">
                <Button className="w-full" size="lg">
                  Sign in to your account
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="rounded-lg border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Company Name</label>
                    <Input
                      type="text"
                      placeholder="Acme Corp"
                      value={companyName}
                      onChange={(e) => { setCompanyName(e.target.value); setFieldErrors((p) => ({ ...p, companyName: "" })) }}
                      autoComplete="organization"
                    />
                    {fieldErrors.companyName && <p className="text-xs text-error">{fieldErrors.companyName}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Work Email</label>
                    <Input
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: "" })) }}
                      autoComplete="email"
                    />
                    {fieldErrors.email && <p className="text-xs text-error">{fieldErrors.email}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">First Name</label>
                    <Input
                      type="text"
                      placeholder="John"
                      value={firstName}
                      onChange={(e) => { setFirstName(e.target.value); setFieldErrors((p) => ({ ...p, firstName: "" })) }}
                      autoComplete="given-name"
                    />
                    {fieldErrors.firstName && <p className="text-xs text-error">{fieldErrors.firstName}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Last Name</label>
                    <Input
                      type="text"
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => { setLastName(e.target.value); setFieldErrors((p) => ({ ...p, lastName: "" })) }}
                      autoComplete="family-name"
                    />
                    {fieldErrors.lastName && <p className="text-xs text-error">{fieldErrors.lastName}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Password</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="At least 12 characters"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: "" })) }}
                      autoComplete="new-password"
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
                  {fieldErrors.password && <p className="text-xs text-error">{fieldErrors.password}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Confirm Password</label>
                  <Input
                    type="password"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors((p) => ({ ...p, confirmPassword: "" })) }}
                    autoComplete="new-password"
                  />
                  {fieldErrors.confirmPassword && <p className="text-xs text-error">{fieldErrors.confirmPassword}</p>}
                </div>

                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="acceptTerms"
                    checked={acceptTerms}
                    onChange={(e) => { setAcceptTerms(e.target.checked); setFieldErrors((p) => ({ ...p, acceptTerms: "" })) }}
                    className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                  />
                  <label htmlFor="acceptTerms" className="text-sm text-muted-foreground leading-relaxed select-none">
                    I accept the{" "}
                    <Link href="/terms" className="font-medium text-primary hover:text-primary/80 transition-colors">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="font-medium text-primary hover:text-primary/80 transition-colors">
                      Privacy Policy
                    </Link>
                  </label>
                </div>
                {fieldErrors.acceptTerms && <p className="text-xs text-error -mt-2">{fieldErrors.acceptTerms}</p>}

                <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                  {submitting ? "Creating account..." : "Create Account"}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link href="/login" className="font-medium text-primary hover:text-primary/80 transition-colors">
                    Sign in
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
