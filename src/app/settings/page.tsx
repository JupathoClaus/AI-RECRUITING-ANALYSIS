"use client"

import { useState } from "react"
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
  Chainlink,
  Key,
  Logout,
  Monitor,
  Mobile,
  Global,
  Add,
  Copy,
  Eye,
  EyeSlash,
  Message,
  Calendar,
  Document,
  MagicStar,
  TickCircle,
  Warning2,
  Briefcase,
  People as UsersIcon,
} from "iconsax-react"
import { AppLayout } from "@/components/layout/app-layout"
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
import { cn } from "@/lib/utils"

interface Integration {
  id: string
  name: string
  description: string
  connected: boolean
  status: "Connected" | "Disconnected" | "Error"
}

const initialIntegrations: Integration[] = [
  { id: "linkedin", name: "LinkedIn", description: "Import candidate profiles and job postings directly from LinkedIn Recruiter.", connected: true, status: "Connected" },
  { id: "indeed", name: "Indeed", description: "Sync job listings and receive applications from Indeed.", connected: true, status: "Connected" },
  { id: "glassdoor", name: "Glassdoor", description: "Publish jobs to Glassdoor and gather employer reviews.", connected: false, status: "Disconnected" },
  { id: "workday", name: "Workday", description: "Two-way sync for employee data, positions, and hires.", connected: true, status: "Error" },
  { id: "bamboohr", name: "BambooHR", description: "Synchronize candidate data and HR records automatically.", connected: false, status: "Disconnected" },
]

const activeSessions = [
  { id: "s1", device: "Chrome on Windows", ip: "192.168.1.42", lastActive: "Active now", current: true },
  { id: "s2", device: "Safari on macOS", ip: "10.0.0.15", lastActive: "2h ago", current: false },
  { id: "s3", device: "AI Recruiter Mobile App", ip: "203.0.113.42", lastActive: "1d ago", current: false },
]

const apiKeys = [
  { id: "k1", name: "Production API", key: "ta_live_••••••••••••a3f8", created: "Jun 15, 2026", lastUsed: "2h ago" },
  { id: "k2", name: "Staging API", key: "ta_test_••••••••••••b2c1", created: "Jun 1, 2026", lastUsed: "5d ago" },
]

const integrationIcons: Record<string, React.ReactNode> = {
  linkedin: <Global className="h-8 w-8 text-[#0A66C2]" />,
  indeed: <Briefcase className="h-8 w-8 text-[#003A9B]" />,
  glassdoor: <Buildings className="h-8 w-8 text-[#0CAA41]" />,
  workday: <Calendar className="h-8 w-8 text-[#F5821F]" />,
  bamboohr: <UsersIcon className="h-8 w-8 text-[#00A3E0]" />,
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("profile")
  const [showPassword, setShowPassword] = useState(false)
  const [twoFactor, setTwoFactor] = useState(false)
  const [integrations, setIntegrations] = useState(initialIntegrations)
  const [screeningThreshold, setScreeningThreshold] = useState(70)
  const [aiPersonality, setAiPersonality] = useState("professional")
  const [language, setLanguage] = useState("en")
  const [autoSchedule, setAutoSchedule] = useState(true)
  const [recordingEnabled, setRecordingEnabled] = useState(false)

  const toggleIntegration = (id: string) => {
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              connected: !i.connected,
              status: !i.connected ? ("Connected" as const) : ("Disconnected" as const),
            }
          : i
      )
    )
  }

  const getIntegrationIcon = (id: string) => integrationIcons[id]

  const integrationStatusColor: Record<string, string> = {
    Connected: "success",
    Disconnected: "secondary",
    Error: "error",
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">First Name</label>
                    <Input defaultValue="Sarah" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Last Name</label>
                    <Input defaultValue="Chen" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Email</label>
                  <Input type="email" defaultValue="sarah.chen@airecruiter.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Role</label>
                  <Select defaultValue="admin">
                    <SelectTrigger>
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
                <div className="flex justify-end pt-2">
                  <Button>
                    <Save2 className="h-4 w-4" /> Save Changes
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
                  SC
                </Avatar>
                <div className="flex flex-col items-center gap-2">
                  <Button variant="outline" size="sm">
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-medium text-foreground">Company Name</label>
                    <Input defaultValue="AI Recruiter Inc." />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Industry</label>
                    <Select defaultValue="technology">
                      <SelectTrigger>
                        <SelectValue />
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
                    <Select defaultValue="50-200">
                      <SelectTrigger>
                        <SelectValue />
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
                  <Input type="url" defaultValue="https://airecruiter.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Locations</label>
                  <Input defaultValue="San Francisco, CA" />
                  <p className="text-xs text-muted">Separate multiple locations with commas.</p>
                </div>
                <div className="flex justify-end pt-2">
                  <Button>
                    <Save2 className="h-4 w-4" /> Save Changes
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
                <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-surface-elevated border border-border">
                  <Buildings className="h-10 w-10 text-muted" />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Button variant="outline" size="sm">
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
                  defaultChecked: true,
                },
                {
                  id: "applications",
                  label: "Application Alerts",
                  description: "Get notified when new applications are submitted for your job postings.",
                  icon: Document,
                  defaultChecked: true,
                },
                {
                  id: "interviews",
                  label: "Interview Reminders",
                  description: "Receive reminders about upcoming interviews and schedule changes.",
                  icon: Calendar,
                  defaultChecked: true,
                },
                {
                  id: "ai-scores",
                  label: "AI Score Updates",
                  description: "Notifications when candidates receive updated AI assessment scores.",
                  icon: MagicStar,
                  defaultChecked: false,
                },
                {
                  id: "digest",
                  label: "Weekly Digest",
                  description: "A weekly summary of recruitment activity, pipeline changes, and key metrics.",
                  icon: Notification,
                  defaultChecked: true,
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
                    <Switch defaultChecked={notif.defaultChecked} />
                  </div>
                  {idx < 4 && <Separator className="opacity-50" />}
                </div>
              ))}
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
                    <span className="text-xs text-muted">Minimum AI score to advance</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={screeningThreshold}
                    onChange={(e) => setScreeningThreshold(Number(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer bg-surface-elevated accent-[#6366f1]"
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
                      <p className="text-xs text-muted">Automatically schedule interviews for top-scoring candidates</p>
                    </div>
                    <Switch checked={autoSchedule} onCheckedChange={setAutoSchedule} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">AI Interviewer Personality</label>
                    <Select value={aiPersonality} onValueChange={setAiPersonality}>
                      <SelectTrigger>
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
                    <Select value={language} onValueChange={setLanguage}>
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
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Interview Recording</p>
                      <p className="text-xs text-muted">Record AI interview sessions for review and compliance</p>
                    </div>
                    <Switch checked={recordingEnabled} onCheckedChange={setRecordingEnabled} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">AI Model Performance</CardTitle>
                <CardDescription>Current accuracy metrics for the screening model.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {[
                  { label: "Overall Accuracy", value: 94, color: "text-success", barColor: "bg-success" },
                  { label: "Precision", value: 91, color: "text-success", barColor: "bg-success" },
                  { label: "Recall", value: 88, color: "text-primary", barColor: "bg-primary" },
                  { label: "F1 Score", value: 89, color: "text-primary", barColor: "bg-primary" },
                ].map((metric) => (
                  <div key={metric.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-muted">{metric.label}</span>
                      <span className={cn("text-sm font-semibold tabular-nums", metric.color)}>
                        {metric.value}%
                      </span>
                    </div>
                    <Progress
                      value={metric.value}
                      className="h-2"
                      indicatorClassName={metric.barColor}
                    />
                  </div>
                ))}

                <Separator />

                <div className="rounded-lg bg-surface-elevated p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-info-muted mt-0.5">
                      <Cpu className="h-4 w-4 text-info" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Model v2.3.1</p>
                      <p className="text-xs text-muted mt-0.5">
                        Last trained on 5,200 candidates. Next scheduled update: Aug 1, 2026.
                      </p>
                    </div>
                  </div>
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
                  className="flex items-center justify-between rounded-lg border border-border p-4 transition-all duration-200 hover:border-border/80"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-surface-elevated">
                      {getIntegrationIcon(integration.id)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{integration.name}</p>
                        <Badge
                          variant={
                            integrationStatusColor[integration.status] as
                              | "success"
                              | "secondary"
                              | "error"
                          }
                          className="text-[10px]"
                        >
                          <span
                            className={cn(
                              "mr-1 inline-block h-1.5 w-1.5 rounded-full",
                              integration.status === "Connected" && "bg-success",
                              integration.status === "Disconnected" && "bg-muted",
                              integration.status === "Error" && "bg-error"
                            )}
                          />
                          {integration.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted mt-0.5">{integration.description}</p>
                    </div>
                  </div>
                  <Button
                    variant={integration.connected ? "outline" : "default"}
                    size="sm"
                    onClick={() => toggleIntegration(integration.id)}
                    className="shrink-0"
                  >
                    {integration.connected ? (
                      <>
                        <Chainlink className="h-4 w-4" /> Disconnect
                      </>
                    ) : (
                      <>
                        <Link2 className="h-4 w-4" /> Connect
                      </>
                    )}
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
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Current Password</label>
                  <div className="relative">
                    <Input type={showPassword ? "text" : "password"} placeholder="Enter current password" />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">New Password</label>
                    <div className="relative">
                      <Input type={showPassword ? "text" : "password"} placeholder="Enter new password" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Confirm New Password</label>
                    <div className="relative">
                      <Input type={showPassword ? "text" : "password"} placeholder="Confirm new password" />
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
                  <Button>Update Password</Button>
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
                        Secure your account with an authenticator app or SMS code.
                      </p>
                    </div>
                  </div>
                  <Switch checked={twoFactor} onCheckedChange={setTwoFactor} />
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
                  <Button variant="outline" size="sm">
                    <Logout className="h-4 w-4" /> Sign Out All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
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
                    {activeSessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-elevated">
                              {session.device.includes("Mobile") ? (
                                <Mobile className="h-4 w-4 text-muted" />
                              ) : (
                                <Monitor className="h-4 w-4 text-muted" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {session.device}
                                {session.current && (
                                  <span className="ml-2 text-xs text-primary">(Current)</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs text-muted bg-surface-elevated px-2 py-0.5 rounded">
                            {session.ip}
                          </code>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-muted">{session.lastActive}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          {!session.current && (
                            <Button variant="ghost" size="sm" className="h-8 text-xs text-error">
                              Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
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
                  <Button size="sm">
                    <Add className="h-4 w-4" /> Create Key
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Name</TableHead>
                      <TableHead>API Key</TableHead>
                      <TableHead className="hidden sm:table-cell">Created</TableHead>
                      <TableHead className="hidden sm:table-cell">Last Used</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiKeys.map((apiKey) => (
                      <TableRow key={apiKey.id}>
                        <TableCell>
                          <p className="text-sm font-medium text-foreground">{apiKey.name}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="text-xs text-muted bg-surface-elevated px-2 py-0.5 rounded font-mono">
                              {apiKey.key}
                            </code>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <Copy className="h-3 w-3 text-muted" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-muted">{apiKey.created}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-muted">{apiKey.lastUsed}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="h-8 text-xs text-error">
                            Revoke
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  )
}
