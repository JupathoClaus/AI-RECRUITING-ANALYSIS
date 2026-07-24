"use client"

import { useState, useEffect, useCallback } from "react"
import {
  User,
  Buildings,
  Notification,
  Cpu,
  Command,
  Shield,
  DocumentUpload,
  Save2,
  Link2,
  Logout,
  Monitor,
  Mobile,
  Global,
  Add,
  Eye,
  EyeSlash,
  Message,
  Calendar,
  Document,
  MagicStar,
  TickCircle,
  Briefcase,
  People as UsersIcon,
  Flash,
  Chart2,
} from "iconsax-react"
import { AppLayout } from "@/components/layout/app-layout"
import { useAuth } from "@/lib/auth-context"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar } from "@/components/ui/avatar"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { cn, getErrorMessage } from "@/lib/utils"
import * as authApi from "@/lib/api/auth.api"
import * as companyApi from "@/lib/api/company.api"
import type { CompanySettingsResponse } from "@/lib/api/company.api"

interface Integration {
  id: string
  name: string
  description: string
  connected: boolean
  status: "Connected" | "Disconnected" | "Error"
}

const initialIntegrations: Integration[] = [
  { id: "linkedin", name: "LinkedIn", description: "Import candidate profiles and job postings directly from LinkedIn Recruiter.", connected: false, status: "Disconnected" },
  { id: "indeed", name: "Indeed", description: "Sync job listings and receive applications from Indeed.", connected: false, status: "Disconnected" },
  { id: "glassdoor", name: "Glassdoor", description: "Publish jobs to Glassdoor and gather employer reviews.", connected: false, status: "Disconnected" },
  { id: "workday", name: "Workday", description: "Two-way sync for employee data, positions, and hires.", connected: false, status: "Disconnected" },
  { id: "bamboohr", name: "BambooHR", description: "Synchronize candidate data and HR records automatically.", connected: false, status: "Disconnected" },
]

const integrationIcons: Record<string, React.ReactNode> = {
  linkedin: <Global className="h-8 w-8 text-[#0A66C2]" />,
  indeed: <Briefcase className="h-8 w-8 text-[#003A9B]" />,
  glassdoor: <Buildings className="h-8 w-8 text-[#0CAA41]" />,
  workday: <Calendar className="h-8 w-8 text-[#F5821F]" />,
  bamboohr: <UsersIcon className="h-8 w-8 text-[#00A3E0]" />,
}

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const userEmail = user?.email || "";
  const userRole = user?.role?.toLowerCase() || "viewer";

  const [activeTab, setActiveTab] = useState("profile")
  const [showPassword, setShowPassword] = useState(false)
  const [twoFactor, setTwoFactor] = useState(false)
  const [integrations] = useState(initialIntegrations)
  const [screeningThreshold, setScreeningThreshold] = useState(70)
  const [aiPersonality, setAiPersonality] = useState("professional")
  const [language, setLanguage] = useState("en")
  const [applicationAlertsEnabled, setApplicationAlertsEnabled] = useState(true)
  const [autoSchedule, setAutoSchedule] = useState(true)
  const [recordingEnabled, setRecordingEnabled] = useState(false)

  const [companySettings, setCompanySettings] = useState<CompanySettingsResponse | null>(null)
  const [sessions, setSessions] = useState<authApi.AuthSessionResponse[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [pageLoadError, setPageLoadError] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [companySaving, setCompanySaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [companyError, setCompanyError] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [companySuccess, setCompanySuccess] = useState<string | null>(null)
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  const initialFirstName = user?.name?.split(" ")[0] || ""
  const initialLastName = user?.name?.split(" ").slice(1).join(" ") || ""
  const [firstName, setFirstName] = useState(initialFirstName)
  const [lastName, setLastName] = useState(initialLastName)

  const [companyName, setCompanyName] = useState("")
  const [companyIndustry, setCompanyIndustry] = useState("")
  const [companySize, setCompanySize] = useState("")
  const [companyWebsite, setCompanyWebsite] = useState("")
  const [companyCity, setCompanyCity] = useState("")

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [profile, settings] = await Promise.all([
          companyApi.getCompanyProfile(),
          companyApi.getCompanySettings(),
        ])
        if (cancelled) return
        setCompanySettings(settings)
        setCompanyName(profile.name || "")
        setCompanyIndustry(profile.industry || "")
        setCompanySize(profile.companySize || "")
        setCompanyWebsite(profile.website || "")
        setCompanyCity(profile.city || "")
        setLanguage(settings.defaultInterviewLanguage || "en")
        setApplicationAlertsEnabled(settings.notifyRecruiterOnNewApplication)
      } catch (err: unknown) {
        if (!cancelled) setPageLoadError(getErrorMessage(err, "Failed to load settings"))
      } finally {
        if (!cancelled) setPageLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (activeTab !== "security") return
    let cancelled = false
    setSessionsLoading(true)
    setSessionsError(null)
    authApi.getSessions()
      .then((data) => { if (!cancelled) setSessions(data) })
      .catch((err: unknown) => { if (!cancelled) setSessionsError(getErrorMessage(err, "Failed to load sessions")) })
      .finally(() => { if (!cancelled) setSessionsLoading(false) })
    return () => { cancelled = true }
  }, [activeTab])

  const saveProfile = useCallback(async () => {
    setProfileSaving(true)
    setProfileError(null)
    setProfileSuccess(null)
    try {
      await authApi.updateProfile({ firstName, lastName })
      setProfileSuccess("Profile updated successfully")
      refreshUser()
    } catch (err: unknown) {
      setProfileError(getErrorMessage(err, "Failed to update profile"))
    } finally {
      setProfileSaving(false)
    }
  }, [firstName, lastName])

  const saveCompany = useCallback(async () => {
    setCompanySaving(true)
    setCompanyError(null)
    setCompanySuccess(null)
    try {
      await companyApi.updateCompanyProfile({
        name: companyName,
        industry: companyIndustry || undefined,
        companySize: companySize || undefined,
        website: companyWebsite || undefined,
        city: companyCity || undefined,
      })
      setCompanySuccess("Company details updated successfully")
    } catch (err: unknown) {
      setCompanyError(getErrorMessage(err, "Failed to update company"))
    } finally {
      setCompanySaving(false)
    }
  }, [companyName, companyIndustry, companySize, companyWebsite, companyCity])

  const saveSettings = useCallback(async (lang?: string) => {
    setSettingsError(null)
    setSettingsSuccess(null)
    try {
      const updated = await companyApi.updateCompanySettings({
        defaultInterviewLanguage: lang ?? language,
      })
      setCompanySettings(updated)
      setSettingsSuccess("Settings saved successfully")
    } catch (err: unknown) {
      setSettingsError(getErrorMessage(err, "Failed to save settings"))
    }
  }, [language])

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("All password fields are required")
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match")
      return
    }
    setPasswordSaving(true)
    setPasswordError(null)
    setPasswordSuccess(null)
    try {
      await authApi.changePassword({
        currentPassword,
        newPassword,
        passwordConfirmation: confirmPassword,
      })
      setPasswordSuccess("Password changed successfully")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err: unknown) {
      setPasswordError(getErrorMessage(err, "Failed to change password"))
    } finally {
      setPasswordSaving(false)
    }
  }, [currentPassword, newPassword, confirmPassword])

  if (pageLoading) {
    return (
      <AppLayout title="Settings" description="Manage your account, company, and application preferences.">
        <div className="space-y-6 p-6">
          <div className="h-10 w-64 bg-surface-elevated rounded animate-pulse" />
          <div className="h-[600px] bg-surface-elevated rounded animate-pulse" />
        </div>
      </AppLayout>
    )
  }

  if (pageLoadError) {
    return (
      <AppLayout title="Settings" description="Manage your account, company, and application preferences.">
        <div className="flex flex-col items-center justify-center py-16">
          <div className="rounded-lg border border-error/20 bg-error/5 px-6 py-4 text-center">
            <p className="text-sm font-medium text-error">{pageLoadError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      title="Settings"
      description="Manage your account, company, and application preferences."
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" /> Profile
          </TabsTrigger>
          <TabsTrigger value="company" className="gap-2">
            <Buildings className="h-4 w-4" /> Company
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Notification className="h-4 w-4" /> Notifications
          </TabsTrigger>
          <TabsTrigger value="ai-settings" className="gap-2">
            <Cpu className="h-4 w-4" /> AI Settings
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Command className="h-4 w-4" /> Integrations
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" /> Security
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Personal Information</CardTitle>
                <CardDescription>Update your profile details and contact information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {profileError && (
                  <div className="rounded-lg border border-error/20 bg-error/5 px-4 py-2 text-sm text-error">{profileError}</div>
                )}
                {profileSuccess && (
                  <div className="rounded-lg border border-success/20 bg-success/5 px-4 py-2 text-sm text-success">{profileSuccess}</div>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">First Name</label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Last Name</label>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Email</label>
                  <Input type="email" value={userEmail} disabled className="opacity-60" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Role</label>
                  <Select defaultValue={userRole} disabled>
                    <SelectTrigger className="opacity-60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrator</SelectItem>
                      <SelectItem value="recruiter">Recruiter</SelectItem>
                      <SelectItem value="hiring-manager">Hiring Manager</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator className="opacity-50" />
                <div className="flex justify-end">
                  <Button onClick={saveProfile} disabled={profileSaving}>
                    <Save2 className="h-4 w-4" /> {profileSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profile Photo</CardTitle>
                <CardDescription>Upload a profile avatar.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <Avatar className="h-24 w-24 text-lg">
                  {user?.name?.split(" ").map((n) => n[0]).join("") || "U"}
                </Avatar>
                <div className="flex flex-col items-center gap-2">
                  <Button variant="outline" size="sm" disabled title="Photo upload coming soon">
                    <DocumentUpload className="h-4 w-4" /> Upload Photo
                  </Button>
                  <p className="text-xs text-muted">PNG, JPG. Max 2MB.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Company Tab */}
        <TabsContent value="company">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Company Details</CardTitle>
                <CardDescription>Manage your organization&apos;s information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {companyError && (
                  <div className="rounded-lg border border-error/20 bg-error/5 px-4 py-2 text-sm text-error">{companyError}</div>
                )}
                {companySuccess && (
                  <div className="rounded-lg border border-success/20 bg-success/5 px-4 py-2 text-sm text-success">{companySuccess}</div>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-medium text-foreground">Company Name</label>
                    <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Enter company name" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Industry</label>
                    <Select value={companyIndustry || "technology"} onValueChange={setCompanyIndustry}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="technology">Technology</SelectItem>
                        <SelectItem value="finance">Finance</SelectItem>
                        <SelectItem value="healthcare">Healthcare</SelectItem>
                        <SelectItem value="education">Education</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Company Size</label>
                    <Select value={companySize} onValueChange={setCompanySize}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-10">1-10 employees</SelectItem>
                        <SelectItem value="11-50">11-50 employees</SelectItem>
                        <SelectItem value="50-200">50-200 employees</SelectItem>
                        <SelectItem value="201-1000">201-1000 employees</SelectItem>
                        <SelectItem value="1000+">1000+ employees</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Website</label>
                  <Input type="url" value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)} placeholder="https://example.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Locations</label>
                  <Input value={companyCity} onChange={(e) => setCompanyCity(e.target.value)} placeholder="City, State" />
                  <p className="text-xs text-muted">Separate multiple locations with commas.</p>
                </div>
                <Separator className="opacity-50" />
                <div className="flex justify-end">
                  <Button onClick={saveCompany} disabled={companySaving}>
                    <Save2 className="h-4 w-4" /> {companySaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Company Logo</CardTitle>
                <CardDescription>Upload your company logo.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-surface-elevated">
                  <Buildings className="h-10 w-10 text-muted" />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Button variant="outline" size="sm" disabled title="Logo upload coming soon">
                    <DocumentUpload className="h-4 w-4" /> Upload Logo
                  </Button>
                  <p className="text-xs text-muted">PNG, JPG. Max 5MB.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notification Preferences</CardTitle>
              <CardDescription>Control which notifications you receive and how they&apos;re delivered.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-0">
              {[
                {
                  id: "email",
                  label: "Email Notifications",
                  description: "Receive email updates for account activity and important announcements.",
                  icon: Message,
                  checked: true,
                  supported: false,
                },
                {
                  id: "applications",
                  label: "Application Alerts",
                  description: "Get notified when new applications are submitted for your job postings.",
                  icon: Document,
                  checked: companySettings?.notifyRecruiterOnNewApplication ?? true,
                  supported: true,
                },
                {
                  id: "interviews",
                  label: "Interview Reminders",
                  description: "Receive reminders about upcoming interviews and schedule changes.",
                  icon: Calendar,
                  checked: false,
                  supported: false,
                },
                {
                  id: "ai-scores",
                  label: "AI Score Updates",
                  description: "Notifications when candidates receive updated AI assessment scores.",
                  icon: MagicStar,
                  checked: false,
                  supported: false,
                },
                {
                  id: "digest",
                  label: "Weekly Digest",
                  description: "A weekly summary of recruitment activity, pipeline changes, and key metrics.",
                  icon: Notification,
                  checked: false,
                  supported: false,
                },
              ].map((notif, idx) => (
                <div key={notif.id}>
                  <div className="flex items-start justify-between py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-elevated mt-0.5">
                        <notif.icon className="h-4.5 w-4.5 text-muted" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{notif.label}</p>
                        <p className="text-xs text-muted mt-0.5">{notif.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={notif.supported ? applicationAlertsEnabled : notif.checked}
                      disabled={!notif.supported}
                      onCheckedChange={notif.supported ? async (val) => {
                        setApplicationAlertsEnabled(val)
                        try {
                          const updated = await companyApi.updateCompanySettings({
                            notifyRecruiterOnNewApplication: val,
                          })
                          setCompanySettings(updated)
                          setSettingsSuccess("Notification preferences saved")
                        } catch (err: unknown) {
                          setApplicationAlertsEnabled(!val)
                          setSettingsError(getErrorMessage(err, "Failed to update notification preferences"))
                        }
                      } : undefined}
                    />
                  </div>
                  {idx < 4 && <Separator className="opacity-50" />}
                </div>
              ))}
              {settingsError && <p className="text-xs text-error mt-2">{settingsError}</p>}
              {settingsSuccess && <p className="text-xs text-success mt-2">{settingsSuccess}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Settings Tab */}
        <TabsContent value="ai-settings">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">AI Screening Configuration</CardTitle>
                <CardDescription>Adjust the AI candidate screening parameters.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">
                      Screening Threshold: <span className="text-primary">{screeningThreshold}%</span>
                    </label>
                    <span className="text-xs text-muted">Feature coming soon</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={screeningThreshold}
                    onChange={(e) => setScreeningThreshold(Number(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer bg-surface-elevated accent-[#6366f1] opacity-60"
                    disabled
                  />
                  <div className="flex justify-between text-xs text-muted">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                  <Progress value={screeningThreshold} className="h-1.5" />
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Auto-schedule Interviews</p>
                      <p className="text-xs text-muted">Feature coming soon</p>
                    </div>
                    <Switch checked={autoSchedule} onCheckedChange={setAutoSchedule} disabled />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">AI Interviewer Personality</label>
                    <Select value={aiPersonality} onValueChange={setAiPersonality} disabled>
                      <SelectTrigger className="opacity-60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="friendly">Friendly & Approachable</SelectItem>
                        <SelectItem value="technical">Technical & Precise</SelectItem>
                        <SelectItem value="analytical">Analytical & Challenging</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Language Preference</label>
                    <Select value={language} onValueChange={(v) => { setLanguage(v); saveSettings(v) }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                        <SelectItem value="zh">Chinese</SelectItem>
                      </SelectContent>
                    </Select>
                    {settingsError && <p className="text-xs text-error mt-1">{settingsError}</p>}
                    {settingsSuccess && <p className="text-xs text-success mt-1">{settingsSuccess}</p>}
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Interview Recording</p>
                      <p className="text-xs text-muted">Feature coming soon</p>
                    </div>
                    <Switch checked={recordingEnabled} onCheckedChange={setRecordingEnabled} disabled />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Cpu className="text-muted-foreground" size={16} />
                  <div>
                    <CardTitle className="text-base">AI Model Performance</CardTitle>
                    <CardDescription>Accuracy metrics are not available until the model has been deployed and trained on your organization&apos;s data.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated mb-3">
                    <Chart2 className="h-6 w-6 text-muted" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No Model Data Available</p>
                  <p className="text-xs text-muted mt-1 max-w-sm">
                    Performance metrics will appear here once the AI screening model has been trained on sufficient candidate data. Model training begins automatically after processing enough applications.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Platform Integrations</CardTitle>
              <CardDescription>Connect your recruitment tools and platforms to AI Recruiter.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {integrations.map((integration) => (
                <div
                  key={integration.id}
                  className="flex items-center justify-between rounded-lg p-4 transition-all duration-200 hover:border-border/80"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-surface-elevated">
                      {integrationIcons[integration.id]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{integration.name}</p>
                        <Badge
                          variant={integration.connected ? "success" : "secondary"}
                          className="text-[10px]"
                        >
                          <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", integration.connected ? "bg-success" : integration.status === "Error" ? "bg-error" : "bg-muted")} />
                          {integration.connected ? "Connected" : "Coming Soon"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted mt-0.5">{integration.description}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="shrink-0 opacity-50"
                  >
                    <Link2 className="h-4 w-4" /> Connect
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <div className="space-y-6">
            {/* Change Password */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Change Password</CardTitle>
                <CardDescription>Update your account password. Use a strong, unique password.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {passwordError && (
                  <div className="rounded-lg border border-error/20 bg-error/5 px-4 py-2 text-sm text-error">{passwordError}</div>
                )}
                {passwordSuccess && (
                  <div className="rounded-lg border border-success/20 bg-success/5 px-4 py-2 text-sm text-success">{passwordSuccess}</div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Current Password</label>
                  <div className="relative">
                    <Input type={showPassword ? "text" : "password"} placeholder="Enter current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">New Password</label>
                    <div className="relative">
                      <Input type={showPassword ? "text" : "password"} placeholder="Enter new password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Confirm New Password</label>
                    <div className="relative">
                      <Input type={showPassword ? "text" : "password"} placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeSlash className="h-4 w-4 text-muted" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted" />
                    )}
                    <span className="text-xs text-muted">{showPassword ? "Hide" : "Show"} passwords</span>
                  </Button>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleChangePassword} disabled={passwordSaving}>
                    {passwordSaving ? "Updating..." : "Update Password"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Two-Factor Auth */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Two-Factor Authentication</CardTitle>
                <CardDescription>Add an extra layer of security to your account.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-elevated mt-0.5">
                      <Shield className="h-4.5 w-4.5 text-muted" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Two-Factor Authentication</p>
                      <p className="text-xs text-muted mt-0.5">
                        Feature coming soon
                      </p>
                    </div>
                  </div>
                  <Switch checked={twoFactor} onCheckedChange={setTwoFactor} disabled />
                </div>
              </CardContent>
            </Card>

            {/* Active Sessions */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Active Sessions</CardTitle>
                    <CardDescription>Devices and locations where your account is logged in.</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await authApi.logoutAll(true)
                        const updated = await authApi.getSessions()
                        setSessions(updated)
                        setSessionsError(null)
                      } catch (err: unknown) {
                        setSessionsError(getErrorMessage(err, "Failed to sign out other sessions"))
                      }
                    }}
                  >
                    <Logout className="h-4 w-4" /> Sign Out Other Sessions
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {sessionsError && (
                  <div className="mb-4 rounded-lg border border-error/20 bg-error/5 px-4 py-2 text-sm text-error">{sessionsError}</div>
                )}
                {sessionsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Device</TableHead>
                      <TableHead className="hidden sm:table-cell">IP Address</TableHead>
                      <TableHead>Last Active</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-muted py-4">No active sessions</TableCell>
                      </TableRow>
                    ) : (
                    sessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-elevated">
                              {session.userAgent?.includes("Mobile") ? (
                                <Mobile className="h-4 w-4 text-muted" />
                              ) : (
                                <Monitor className="h-4 w-4 text-muted" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {session.deviceName || session.userAgent || "Unknown device"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs text-muted bg-surface-elevated px-2 py-0.5 rounded">
                            {session.ipAddress || "—"}
                          </code>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-muted">{session.lastUsedAt ? new Date(session.lastUsedAt).toLocaleDateString() : "—"}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-error"
                            onClick={async () => {
                              try {
                                await authApi.revokeSession(session.id)
                                setSessions((prev) => prev.filter((s) => s.id !== session.id))
                                setSessionsError(null)
                              } catch (err: unknown) {
                                setSessionsError(getErrorMessage(err, "Failed to revoke session"))
                              }
                            }}
                          >
                            Revoke
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                    )}
                  </TableBody>
                </Table>
                </div>
                )}
              </CardContent>
            </Card>

            {/* API Keys */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">API Keys</CardTitle>
                    <CardDescription>Manage API keys for programmatic access to AI Recruiter.</CardDescription>
                  </div>
                  <Button size="sm" disabled>
                    <Add className="h-4 w-4" /> Create Key
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg bg-surface-elevated p-6 text-center">
                  <p className="text-sm text-muted">API key management is not available yet.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  )
}
