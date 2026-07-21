"use client"

import * as React from "react"
import { useStore } from "@/store/useStore"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn, getInitials } from "@/lib/utils"
import {
  Buildings,
  Edit2,
  People,
  Briefcase,
  Location,
  Global,
  Calendar,
  Message,
  Call,
  Export,
  Add,
  TrendUp,
  Bank,
  Layer,
  Chart2,
} from "iconsax-react"

interface TeamMember {
  id: string
  name: string
  role: string
  department: string
  email: string
  phone: string
  location: string
  startDate: Date
}

interface Department {
  id: string
  name: string
  head: string
  headcount: number
  openPositions: number
  description: string
}

const teamMembers: TeamMember[] = [
  { id: "tm1", name: "Sarah Kim", role: "VP of Product", department: "Product", email: "sarah.k@airecruiter.com", phone: "+1 555-1001", location: "San Francisco, CA", startDate: new Date("2023-01-15") },
  { id: "tm2", name: "David Park", role: "Engineering Manager", department: "Engineering", email: "david.p@airecruiter.com", phone: "+1 555-1002", location: "San Francisco, CA", startDate: new Date("2022-06-01") },
  { id: "tm3", name: "Emily Chen", role: "Senior Frontend Engineer", department: "Engineering", email: "emily.c@airecruiter.com", phone: "+1 555-1003", location: "Remote", startDate: new Date("2024-03-10") },
  { id: "tm4", name: "Marcus Johnson", role: "Head of Design", department: "Design", email: "marcus.j@airecruiter.com", phone: "+1 555-1004", location: "New York, NY", startDate: new Date("2023-04-20") },
  { id: "tm5", name: "Priya Patel", role: "Data Science Lead", department: "Data", email: "priya.p@airecruiter.com", phone: "+1 555-1005", location: "Austin, TX", startDate: new Date("2023-09-05") },
  { id: "tm6", name: "Alex Rivera", role: "DevOps Engineer", department: "Engineering", email: "alex.r@airecruiter.com", phone: "+1 555-1006", location: "Seattle, WA", startDate: new Date("2025-07-01") },
  { id: "tm7", name: "Lisa Wang", role: "Marketing Director", department: "Marketing", email: "lisa.w@airecruiter.com", phone: "+1 555-1007", location: "San Francisco, CA", startDate: new Date("2022-11-15") },
  { id: "tm8", name: "James O'Brien", role: "HR Business Partner", department: "People Ops", email: "james.o@airecruiter.com", phone: "+1 555-1008", location: "New York, NY", startDate: new Date("2024-01-08") },
]

const departments: Department[] = [
  { id: "d1", name: "Engineering", head: "David Park", headcount: 142, openPositions: 5, description: "Building the core platform and AI infrastructure" },
  { id: "d2", name: "Product", head: "Sarah Kim", headcount: 28, openPositions: 1, description: "Driving product strategy and roadmap" },
  { id: "d3", name: "Design", head: "Marcus Johnson", headcount: 22, openPositions: 1, description: "Creating intuitive user experiences" },
  { id: "d4", name: "Data", head: "Priya Patel", headcount: 35, openPositions: 2, description: "Analytics, ML models, and data infrastructure" },
  { id: "d5", name: "Marketing", head: "Lisa Wang", headcount: 45, openPositions: 2, description: "Brand, growth, and demand generation" },
  { id: "d6", name: "People Ops", head: "James O'Brien", headcount: 18, openPositions: 1, description: "HR, talent, and employee experience" },
]

const companyMetrics = [
  { label: "Total Employees", value: "342", icon: People, color: "text-primary", accent: "border-l-primary" },
  { label: "Open Positions", value: "12", icon: Briefcase, color: "text-success", accent: "border-l-success" },
  { label: "Departments", value: "8", icon: Layer, color: "text-warning", accent: "border-l-warning" },
  { label: "Office Locations", value: "3", icon: Location, color: "text-info", accent: "border-l-info" },
]

export default function CompanyPage() {
  const { jobs } = useStore()
  const [isEditing, setIsEditing] = React.useState(false)

  const totalOpenPositions = departments.reduce((sum, d) => sum + d.openPositions, 0)

  return (
    <AppLayout
      title="Company Profile"
      description="Manage your organization's profile and team."
      actions={
        <Button size="sm" variant={isEditing ? "default" : "outline"} onClick={() => setIsEditing(!isEditing)}>
          <Edit2 className="h-4 w-4" />
          {isEditing ? "Save Changes" : "Edit Profile"}
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Company Metrics */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in">
          {companyMetrics.map((metric) => (
            <Card
              key={metric.label}
              className={cn("group relative overflow-hidden transition-all duration-200 hover:shadow-xl border-l-4", metric.accent)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-sm text-muted font-semibold uppercase tracking-wide">{metric.label}</p>
                    <p className="text-3xl font-bold tracking-tight text-foreground">{metric.value}</p>
                  </div>
                  <div className={cn("shrink-0 transition-transform duration-200 group-hover:scale-110", metric.color)}>
                    <metric.icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Company Info Card */}
        <Card className="animate-fade-in">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Company Logo */}
              <div className="shrink-0">
                <div className="h-20 w-20 rounded-xl bg-primary-muted flex items-center justify-center">
                  <Buildings className="h-10 w-10 text-primary" />
                </div>
              </div>

              {/* Company Details */}
              <div className="flex-1 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">AI Recruiter Inc.</h2>
                    <p className="text-sm text-muted mt-1">AI-Powered Recruitment Platform</p>
                  </div>
                  <Badge variant="default" className="shrink-0">Technology</Badge>
                </div>

                <p className="text-sm text-muted leading-relaxed max-w-2xl">
                  AI Recruiter is revolutionizing the recruitment industry with AI-driven candidate screening,
                  intelligent interview scheduling, and data-powered hiring insights. Our platform helps
                  companies find the best talent faster and more efficiently.
                </p>

                <Separator className="bg-border" />

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Layer className="h-4 w-4 text-muted shrink-0" />
                    <span className="text-muted">Industry:</span>
                    <span className="text-foreground font-medium">Technology</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <People className="h-4 w-4 text-muted shrink-0" />
                    <span className="text-muted">Company Size:</span>
                    <span className="text-foreground font-medium">200-500</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted shrink-0" />
                    <span className="text-muted">Founded:</span>
                    <span className="text-foreground font-medium">2021</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Location className="h-4 w-4 text-muted shrink-0" />
                    <span className="text-muted">HQ:</span>
                    <span className="text-foreground font-medium">San Francisco, CA</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Global className="h-4 w-4 text-muted shrink-0" />
                    <span className="text-muted">Website:</span>
                    <span className="text-foreground font-medium">airecruiter.com</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Message className="h-4 w-4 text-muted shrink-0" />
                    <span className="text-muted">Email:</span>
                    <span className="text-foreground font-medium">hello@airecruiter.com</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Team Members */}
        <div className="animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Team Members</h3>
              <p className="text-sm text-muted">{teamMembers.length} members across {departments.length} departments</p>
            </div>
            <Button size="sm" variant="outline">
              <Add className="h-4 w-4" />
              Add Member
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {teamMembers.map((member) => (
              <Card
                key={member.id}
                className="group hover:border-primary/30 transition-all duration-200"
              >
                <CardContent className="p-4">
                  <div className="flex flex-col items-center text-center">
                    <div className="h-14 w-14 rounded-full bg-surface-elevated flex items-center justify-center text-lg font-semibold text-foreground mb-3">
                      {getInitials(member.name)}
                    </div>
                    <h4 className="text-sm font-semibold text-foreground truncate w-full">{member.name}</h4>
                    <p className="text-xs text-primary mt-0.5 truncate w-full">{member.role}</p>
                    <Badge variant="outline" className="text-[10px] mt-2">{member.department}</Badge>

                    <Separator className="bg-border w-full my-3" />

                    <div className="space-y-2 w-full text-left">
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <Message className="h-3 w-3 shrink-0" />
                        <span className="truncate">{member.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <Location className="h-3 w-3 shrink-0" />
                        <span className="truncate">{member.location}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Departments Overview */}
        <div className="animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Departments</h3>
              <p className="text-sm text-muted">{departments.length} departments · {totalOpenPositions} open positions</p>
            </div>
            <Button size="sm" variant="outline">
              <Add className="h-4 w-4" />
              Add Department
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map((dept) => (
              <Card
                key={dept.id}
                className="group hover:border-primary/30 transition-all duration-200"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-sm">{dept.name}</CardTitle>
                      <CardDescription className="text-xs mt-1">Led by {dept.head}</CardDescription>
                    </div>
                    <div className="h-8 w-8 rounded-lg bg-surface-elevated flex items-center justify-center shrink-0">
                      <Buildings className="h-4 w-4 text-muted" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-4 space-y-3">
                  <p className="text-xs text-muted leading-relaxed">{dept.description}</p>
                  <Separator className="bg-border" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <People className="h-3.5 w-3.5" />
                      <span>{dept.headcount} people</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <Briefcase className="h-3.5 w-3.5 text-muted" />
                      <span className={cn(
                        "font-medium",
                        dept.openPositions > 0 ? "text-success" : "text-muted"
                      )}>
                        {dept.openPositions} open
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Office Locations */}
        <Card className="animate-fade-in">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Office Locations</CardTitle>
                <CardDescription>3 offices across the United States</CardDescription>
              </div>
              <Location className="h-4 w-4 text-muted" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { city: "San Francisco, CA", type: "Headquarters", employees: 180, address: "123 Market Street, Suite 400" },
                { city: "New York, NY", type: "East Coast Hub", employees: 92, address: "456 Broadway, Floor 12" },
                { city: "Austin, TX", type: "Engineering Center", employees: 70, address: "789 Congress Avenue, Suite 200" },
              ].map((office) => (
                <div
                  key={office.city}
                  className="rounded-lg border border-border bg-surface p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">{office.city}</h4>
                      <Badge variant="outline" className="text-[10px] mt-1">{office.type}</Badge>
                    </div>
                    <div className="h-8 w-8 rounded-lg bg-surface-elevated flex items-center justify-center">
                      <Location className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                  <p className="text-xs text-muted">{office.address}</p>
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <People className="h-3.5 w-3.5" />
                    <span>{office.employees} employees</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
