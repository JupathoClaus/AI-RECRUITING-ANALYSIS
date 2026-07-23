"use client"

import * as React from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { cn, getInitials } from "@/lib/utils"
import { getCompanyProfile, getCompanyMembers, getDepartments } from "@/lib/api/company.api"
import type { CompanyProfileResponse, CompanyMember, DepartmentDto } from "@/lib/api/types"
import {
  Buildings,
  Edit2,
  People,
  Briefcase,
  Location,
  Global,
  Calendar,
  Message,
  Add,
  Layer,
} from "iconsax-react"

export default function CompanyPage() {
  const [profile, setProfile] = React.useState<CompanyProfileResponse | null>(null)
  const [members, setMembers] = React.useState<CompanyMember[]>([])
  const [departments, setDepartments] = React.useState<DepartmentDto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [isEditing, setIsEditing] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [prof, memberRes, deptRes] = await Promise.all([
          getCompanyProfile(),
          getCompanyMembers({ limit: 50 }),
          getDepartments({ limit: 50 }),
        ])
        if (cancelled) return
        setProfile(prof)
        setMembers(memberRes.items || [])
        setDepartments(deptRes.data || [])
      } catch {
        if (!cancelled) setError("Failed to load company data")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <AppLayout title="Company Profile" description="Loading company information...">
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="p-5"><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-8 w-16" /></CardContent></Card>
            ))}
          </div>
          <Card><CardContent className="p-6"><Skeleton className="h-20 w-20 rounded-xl mb-4" /><Skeleton className="h-6 w-48 mb-2" /><Skeleton className="h-4 w-96" /></CardContent></Card>
        </div>
      </AppLayout>
    )
  }

  if (error || !profile) {
    return (
      <AppLayout title="Company Profile" description={error || "Company not found"}>
        <Card><CardContent className="p-6 text-center text-muted">{error || "No company data available"}</CardContent></Card>
      </AppLayout>
    )
  }

  const metrics = [
    { label: "Total Members", value: profile.memberCount.toString(), icon: People, color: "text-primary", accent: "border-l-primary" },
    { label: "Departments", value: profile.departmentCount.toString(), icon: Layer, color: "text-warning", accent: "border-l-warning" },
    { label: "Open Positions", value: "—", icon: Briefcase, color: "text-success", accent: "border-l-success" },
    { label: "Office Locations", value: profile.primaryLocation ? "1" : "0", icon: Location, color: "text-info", accent: "border-l-info" },
  ]

  const companyInfo = [
    { icon: Layer, label: "Industry", value: profile.industry || "—" },
    { icon: People, label: "Company Size", value: profile.companySize || "—" },
    { icon: Calendar, label: "Founded", value: profile.createdAt ? new Date(profile.createdAt).getFullYear().toString() : "—" },
    { icon: Location, label: "HQ", value: profile.city ? `${profile.city}${profile.stateOrProvince ? `, ${profile.stateOrProvince}` : ""}` : "—" },
    { icon: Global, label: "Website", value: profile.website || "—" },
    { icon: Message, label: "Email", value: profile.recruitmentEmail || profile.supportEmail || "—" },
  ]

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
        {/* Metrics */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in">
          {metrics.map((metric) => (
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

        {/* Company Info */}
        <Card className="animate-fade-in">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-1 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">{profile.name}</h2>
                    <p className="text-sm text-muted mt-1">{profile.description || profile.legalName || profile.industry || ""}</p>
                  </div>
                  {profile.industry && <Badge variant="default" className="shrink-0">{profile.industry}</Badge>}
                </div>
                <p className="text-sm text-muted leading-relaxed max-w-2xl">{profile.description || ""}</p>
                <Separator className="bg-border" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {companyInfo.map((info) => (
                    <div key={info.label} className="flex items-center gap-2 text-sm">
                      <info.icon className="h-4 w-4 text-muted shrink-0" />
                      <span className="text-muted">{info.label}:</span>
                      <span className="text-foreground font-medium truncate">{info.value}</span>
                    </div>
                  ))}
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
              <p className="text-sm text-muted">{members.length} member{members.length !== 1 ? "s" : ""}</p>
            </div>
            <Button size="sm" variant="outline">
              <Add className="h-4 w-4" />
              Add Member
            </Button>
          </div>
          {members.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted">No team members found</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {members.map((member) => (
                <Card key={member.id} className="group hover:border-primary/30 transition-all duration-200">
                  <CardContent className="p-4">
                    <div className="flex flex-col items-center text-center">
                      <div className="h-14 w-14 rounded-full bg-surface-elevated flex items-center justify-center text-lg font-semibold text-foreground mb-3">
                        {getInitials(`${member.user?.firstName ?? ""} ${member.user?.lastName ?? ""}`)}
                      </div>
                      <h4 className="text-sm font-semibold text-foreground truncate w-full">{member.user?.firstName} {member.user?.lastName}</h4>
                      <p className="text-xs text-primary mt-0.5 truncate w-full">{member.jobTitle || member.role.name}</p>
                      <Badge variant="outline" className="text-[10px] mt-2">
                        {member.departments?.[0]?.department?.name || member.role.name}
                      </Badge>
                      <Separator className="bg-border w-full my-3" />
                      <div className="space-y-2 w-full text-left">
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <Message className="h-3 w-3 shrink-0" />
                          <span className="truncate">{member.user?.email}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Departments */}
        <div className="animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Departments</h3>
              <p className="text-sm text-muted">{departments.length} department{departments.length !== 1 ? "s" : ""}</p>
            </div>
            <Button size="sm" variant="outline">
              <Add className="h-4 w-4" />
              Add Department
            </Button>
          </div>
          {departments.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted">No departments found</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {departments.map((dept) => (
                <Card key={dept.id} className="group hover:border-primary/30 transition-all duration-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-sm">{dept.name}</CardTitle>
                        {dept.managerMembership?.user && (
                          <CardDescription className="text-xs mt-1">
                            Led by {dept.managerMembership.user.firstName} {dept.managerMembership.user.lastName}
                          </CardDescription>
                        )}
                      </div>
                      <div className="h-8 w-8 rounded-lg bg-surface-elevated flex items-center justify-center shrink-0">
                        <Buildings className="h-4 w-4 text-muted" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4 space-y-3">
                    <p className="text-xs text-muted leading-relaxed">{dept.description || ""}</p>
                    <Separator className="bg-border" />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-muted">
                        <People className="h-3.5 w-3.5" />
                        <span>{dept._count?.departmentMemberships || 0} people</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <Briefcase className="h-3.5 w-3.5 text-muted" />
                        <span className={cn(
                          "font-medium",
                          dept.openPositions && dept.openPositions > 0 ? "text-success" : "text-muted"
                        )}>
                          {dept.openPositions || 0} open
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
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
                  className="rounded-lg bg-surface p-4 space-y-3"
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
