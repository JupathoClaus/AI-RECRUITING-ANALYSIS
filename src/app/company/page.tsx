"use client"

import * as React from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { cn, getInitials, getErrorMessage } from "@/lib/utils"
import { getCompanyProfile, getCompanyMembers, getDepartments, suspendCompanyMember, reactivateCompanyMember, removeCompanyMember, createInvitation, getInvitations, resendInvitation, revokeInvitation, createDepartment, archiveDepartment, getCompanyRoles } from "@/lib/api/company.api"
import type { CompanyProfileResponse, CompanyMember, DepartmentDto } from "@/lib/api/types"
import type { CompanyInvitationResponse, CompanyRoleResponse, CreateInvitationRequest, CreateDepartmentRequest } from "@/lib/api/company.api"
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
  CloseCircle,
  ArrowRotateLeft,
  Trash,
  Sms,
  Send2,
} from "iconsax-react"

export default function CompanyPage() {
  const [profile, setProfile] = React.useState<CompanyProfileResponse | null>(null)
  const [members, setMembers] = React.useState<CompanyMember[]>([])
  const [departments, setDepartments] = React.useState<DepartmentDto[]>([])
  const [invitations, setInvitations] = React.useState<CompanyInvitationResponse[]>([])
  const [roles, setRoles] = React.useState<CompanyRoleResponse[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [invitationsError, setInvitationsError] = React.useState<string | null>(null)

  // Invitation dialog
  const [inviteDialogOpen, setInviteDialogOpen] = React.useState(false)
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [inviteRoleId, setInviteRoleId] = React.useState("")
  const [inviteDepartmentId, setInviteDepartmentId] = React.useState("")
  const [inviteJobTitle, setInviteJobTitle] = React.useState("")
  const [inviteSaving, setInviteSaving] = React.useState(false)
  const [inviteError, setInviteError] = React.useState<string | null>(null)

  // Department creation dialog
  const [deptDialogOpen, setDeptDialogOpen] = React.useState(false)
  const [deptName, setDeptName] = React.useState("")
  const [deptDescription, setDeptDescription] = React.useState("")
  const [deptManagerId, setDeptManagerId] = React.useState("")
  const [deptSaving, setDeptSaving] = React.useState(false)
  const [deptError, setDeptError] = React.useState<string | null>(null)

  // Confirmation dialog
  const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
  const [confirmAction, setConfirmAction] = React.useState<{ title: string; description: string; onConfirm: () => Promise<void>; loading: boolean } | null>(null)

  // Member action loading
  const [memberActionLoading, setMemberActionLoading] = React.useState<string | null>(null)

  const openConfirm = (title: string, description: string, onConfirm: () => Promise<void>) => {
    setConfirmAction({ title, description, onConfirm, loading: false })
    setConfirmDialogOpen(true)
  }

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [prof, memberRes, deptRes, inviteRes, roleRes] = await Promise.all([
          getCompanyProfile(),
          getCompanyMembers({ limit: 50 }),
          getDepartments({ limit: 50 }),
          getInvitations({ limit: 50, status: "PENDING" }),
          getCompanyRoles(),
        ])
        if (cancelled) return
        setProfile(prof)
        setMembers(memberRes.items || [])
        setDepartments(deptRes.data || [])
        setInvitations(inviteRes.items || [])
        setRoles(roleRes || [])
      } catch {
        if (!cancelled) setError("Failed to load company data")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const handleSuspendMember = async (membershipId: string) => {
    setMemberActionLoading(membershipId)
    setActionError(null)
    try {
      await suspendCompanyMember(membershipId)
      setMembers((prev) => prev.map((m) => m.id === membershipId ? { ...m, status: "SUSPENDED" } : m))
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, "Failed to suspend member"))
    } finally {
      setMemberActionLoading(null)
    }
  }

  const handleReactivateMember = async (membershipId: string) => {
    setMemberActionLoading(membershipId)
    setActionError(null)
    try {
      await reactivateCompanyMember(membershipId)
      setMembers((prev) => prev.map((m) => m.id === membershipId ? { ...m, status: "ACTIVE" } : m))
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, "Failed to reactivate member"))
    } finally {
      setMemberActionLoading(null)
    }
  }

  const handleRemoveMember = async (membershipId: string) => {
    setMemberActionLoading(membershipId)
    setActionError(null)
    try {
      await removeCompanyMember(membershipId)
      setMembers((prev) => prev.filter((m) => m.id !== membershipId))
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, "Failed to remove member"))
    } finally {
      setMemberActionLoading(null)
    }
  }

  const handleSendInvite = async () => {
    if (!inviteEmail || !inviteRoleId) return
    setInviteSaving(true)
    setInviteError(null)
    try {
      const dto: CreateInvitationRequest = { email: inviteEmail, roleId: inviteRoleId }
      if (inviteDepartmentId) dto.departmentId = inviteDepartmentId
      if (inviteJobTitle) dto.jobTitle = inviteJobTitle
      const result = await createInvitation(dto)
      setInvitations((prev) => [...prev, result])
      setInviteDialogOpen(false)
      setInviteEmail("")
      setInviteRoleId("")
      setInviteDepartmentId("")
      setInviteJobTitle("")
    } catch (err: unknown) {
      setInviteError(getErrorMessage(err, "Failed to send invitation"))
    } finally {
      setInviteSaving(false)
    }
  }

  const handleCreateDepartment = async () => {
    if (!deptName) return
    setDeptSaving(true)
    setDeptError(null)
    try {
      const dto: CreateDepartmentRequest = { name: deptName }
      if (deptDescription) dto.description = deptDescription
      if (deptManagerId) dto.managerMembershipId = deptManagerId
      const result = await createDepartment(dto)
      setDepartments((prev) => [...prev, result])
      setDeptDialogOpen(false)
      setDeptName("")
      setDeptDescription("")
      setDeptManagerId("")
    } catch (err: unknown) {
      setDeptError(getErrorMessage(err, "Failed to create department"))
    } finally {
      setDeptSaving(false)
    }
  }

  const handleArchiveDepartment = async (departmentId: string) => {
    setActionError(null)
    try {
      await archiveDepartment(departmentId)
      setDepartments((prev) => prev.filter((d) => d.id !== departmentId))
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, "Failed to archive department"))
    }
  }

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
        <Button size="sm" variant="outline" onClick={() => window.location.href = "/settings?tab=company"}>
          <Edit2 className="h-4 w-4" />
          Edit in Settings
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Metrics */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in">
          {metrics.map((metric) => (
            <Card
              key={metric.label}
              className={cn("group relative overflow-hidden transition-all duration-200 hover:shadow-xl border-l-4 h-full flex flex-col", metric.accent)}
            >
              <CardContent className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="min-h-[48px]">
                      <p className="text-sm text-muted font-semibold uppercase tracking-wide">{metric.label}</p>
                    </div>
                    <div className="min-h-[56px] flex items-start">
                      <p className="text-3xl font-bold leading-none tracking-tight text-foreground">{metric.value}</p>
                    </div>
                    <div className="min-h-[24px]" />
                  </div>
                  <div className={cn("shrink-0 transition-transform duration-200 group-hover:scale-110 ml-3", metric.color)}>
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
            <Button size="sm" variant="outline" onClick={() => setInviteDialogOpen(true)}>
              <Add className="h-4 w-4" />
              Add Member
            </Button>
          </div>
          {actionError && (
            <div className="mb-4 rounded-lg border border-error/20 bg-error/5 px-4 py-2 text-sm text-error">{actionError}</div>
          )}
          {members.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted">No team members found</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {members.map((member) => (
                <Card key={member.id} className="group hover:border-primary/30 transition-all duration-200 relative">
                  <CardContent className="p-4">
                    <div className="flex flex-col items-center text-center">
                      <div className="h-14 w-14 rounded-full bg-surface-elevated flex items-center justify-center text-lg font-semibold text-foreground mb-3">
                        {getInitials(`${member.user?.firstName ?? ""} ${member.user?.lastName ?? ""}`)}
                      </div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-foreground truncate max-w-[160px]">{member.user?.firstName} {member.user?.lastName}</h4>
                        <Badge variant={member.status === "ACTIVE" ? "success" : member.status === "SUSPENDED" ? "warning" : "secondary"} className="text-[10px] shrink-0">
                          {member.status}
                        </Badge>
                      </div>
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
                      <div className="flex items-center justify-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        {member.status === "ACTIVE" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-warning"
                            disabled={memberActionLoading === member.id}
                            onClick={() => openConfirm("Suspend Member", `Are you sure you want to suspend ${member.user?.firstName} ${member.user?.lastName}? They will be unable to access the account until reactivated.`, () => handleSuspendMember(member.id))}
                          >
                            Suspend
                          </Button>
                        )}
                        {member.status === "SUSPENDED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-success"
                            disabled={memberActionLoading === member.id}
                            onClick={() => handleReactivateMember(member.id)}
                          >
                            <ArrowRotateLeft className="h-3 w-3 mr-1" /> Reactivate
                          </Button>
                        )}
                        {member.status !== "REMOVED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-error"
                            disabled={memberActionLoading === member.id}
                            onClick={() => openConfirm("Remove Member", `Are you sure you want to remove ${member.user?.firstName} ${member.user?.lastName} from the company? This action cannot be undone.`, () => handleRemoveMember(member.id))}
                          >
                            <Trash className="h-3 w-3 mr-1" /> Remove
                          </Button>
                        )}
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
            <Button size="sm" variant="outline" onClick={() => setDeptDialogOpen(true)}>
              <Add className="h-4 w-4" />
              Add Department
            </Button>
          </div>
          {departments.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted">No departments found</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {departments.map((dept) => (
                <Card key={dept.id} className="group hover:border-primary/30 transition-all duration-200 h-full flex flex-col">
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
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => openConfirm("Archive Department", `Are you sure you want to archive ${dept.name}? This will hide it from active views.`, () => handleArchiveDepartment(dept.id))}
                        >
                          <Trash className="h-3.5 w-3.5" />
                        </Button>
                        <div className="h-8 w-8 rounded-lg bg-surface-elevated flex items-center justify-center shrink-0">
                          <Buildings className="h-4 w-4 text-muted" />
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4 space-y-3 mt-auto">
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

        {/* Invitations */}
        <div className="animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Pending Invitations</h3>
              <p className="text-sm text-muted">{invitations.length} pending invitation{invitations.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          {invitationsError && (
            <div className="mb-4 rounded-lg border border-error/20 bg-error/5 px-4 py-2 text-sm text-error">{invitationsError}</div>
          )}
          {invitations.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted">No pending invitations</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {invitations.map((inv) => (
                <Card key={inv.id} className="hover:border-primary/30 transition-all duration-200">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-elevated">
                        <Sms className="h-4 w-4 text-muted" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{inv.email}</p>
                        <p className="text-xs text-muted">
                          Role: {inv.role.name}{inv.department ? ` · Dept: ${inv.department.name}` : ""}
                          {inv.jobTitle ? ` · ${inv.jobTitle}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-[10px]">{inv.status}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        disabled={memberActionLoading === inv.id}
                        onClick={async () => {
                          try {
                            await resendInvitation(inv.id)
                          } catch (err: unknown) {
                            setInvitationsError(getErrorMessage(err, "Failed to resend invitation"))
                          }
                        }}
                      >
                        <Send2 className="h-3.5 w-3.5 text-muted" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-error"
                        disabled={memberActionLoading === inv.id}
                        onClick={async () => {
                          try {
                            await revokeInvitation(inv.id)
                            setInvitations((prev) => prev.filter((i) => i.id !== inv.id))
                          } catch (err: unknown) {
                            setInvitationsError(getErrorMessage(err, "Failed to revoke invitation"))
                          }
                        }}
                      >
                        <CloseCircle className="h-3.5 w-3.5" />
                      </Button>
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
                <CardDescription>Location data is not synced yet.</CardDescription>
              </div>
              <Location className="h-4 w-4 text-muted" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated mb-3">
                <Location className="h-6 w-6 text-muted" />
              </div>
              <p className="text-sm font-medium text-foreground">No Office Locations Configured</p>
              <p className="text-xs text-muted mt-1 max-w-sm">
                Office location management is not available yet. Update your company address in Settings.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => window.location.href = "/settings?tab=company"}
              >
                <Edit2 className="h-4 w-4" />
                Go to Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmAction?.title || "Confirm"}</DialogTitle>
            <DialogDescription>{confirmAction?.description || "Are you sure?"}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={confirmAction?.loading}
              onClick={async () => {
                if (!confirmAction) return
                try {
                  await confirmAction.onConfirm()
                  setConfirmDialogOpen(false)
                } catch { /* handled by action */ }
              }}
            >
              {confirmAction?.loading ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Member Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>Send an invitation to join your company.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {inviteError && (
              <div className="rounded-lg border border-error/20 bg-error/5 px-4 py-2 text-sm text-error">{inviteError}</div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email Address</label>
              <Input type="email" placeholder="colleague@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Role</label>
              <Select value={inviteRoleId} onValueChange={setInviteRoleId}>
                <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Department (optional)</label>
              <Select value={inviteDepartmentId} onValueChange={setInviteDepartmentId}>
                <SelectTrigger><SelectValue placeholder="Select a department" /></SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Job Title (optional)</label>
              <Input placeholder="e.g. Software Engineer" value={inviteJobTitle} onChange={(e) => setInviteJobTitle(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSendInvite} disabled={inviteSaving || !inviteEmail || !inviteRoleId}>
              {inviteSaving ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Department Dialog */}
      <Dialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Department</DialogTitle>
            <DialogDescription>Add a new department to your organization.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {deptError && (
              <div className="rounded-lg border border-error/20 bg-error/5 px-4 py-2 text-sm text-error">{deptError}</div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Department Name</label>
              <Input placeholder="e.g. Engineering" value={deptName} onChange={(e) => setDeptName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Description (optional)</label>
              <Input placeholder="Department purpose and scope" value={deptDescription} onChange={(e) => setDeptDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Manager (optional)</label>
              <Select value={deptManagerId} onValueChange={setDeptManagerId}>
                <SelectTrigger><SelectValue placeholder="Select a manager" /></SelectTrigger>
                <SelectContent>
                  {members.filter((m) => m.status === "ACTIVE").map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.user.firstName} {m.user.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeptDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateDepartment} disabled={deptSaving || !deptName}>
              {deptSaving ? "Creating..." : "Create Department"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
