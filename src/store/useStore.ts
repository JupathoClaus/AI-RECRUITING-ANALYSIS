import { create } from "zustand"
import type { Job, Candidate, Interview, Activity, JobStatus, CandidateStatus } from "@/types"
import {
  fetchCandidates,
  createCandidate,
  mapCandidateFromApi,
  buildApplicationInfo,
  fetchCandidatesScoreSummary,
} from "@/lib/api/candidates.api"
import type { CandidateApiDetail, CandidateScoreSummary } from "@/lib/api/candidates.api"
import {
  fetchApplications,
  fetchApplicationById,
  createApplication,
  rejectApplication,
  shortlistApplication,
  moveApplication,
  submitApplication,
  markApplicationHired,
} from "@/lib/api/applications.api"
import type { CreateCandidateRequest } from "@/lib/api/candidates.api"
import type { ApplicationListItem, ApplicationQueryParams } from "@/lib/api/applications.api"
import { getJobs, getJobPipeline } from "@/lib/api/jobs.api"
import type { PipelineStageDto } from "@/lib/api/jobs.api"
import type { JobListDto } from "@/lib/api/types"
import {
  fetchInterviews as fetchInterviewsApi,
  cancelInterview as cancelInterviewApi,
  completeInterview as completeInterviewApi,
  createInterview as createInterviewApi,
  mapInterviewListItem,
  mapFrontendToBackendType,
} from "@/lib/api/interviews.api"
import type { CreateInterviewRequest, FrontendInterviewType, RescheduleInterviewRequest, RecordResultRequest, BackendInterviewResult } from "@/lib/api/interviews.api"
import { startInterview as startInterviewApi, confirmInterview as confirmInterviewApi } from "@/lib/api/interviews.api"
import { rescheduleInterview as rescheduleInterviewApi, recordResult as recordResultApi } from "@/lib/api/interviews.api"
import {
  getAnalyticsOverview,
  getAnalyticsFunnel,
  getAnalyticsDepartments,
  getAnalyticsSources,
  getAnalyticsTimeToHire,
  getApplicationsOverTime,
  getRecentActivity,
} from "@/lib/api/analytics.api"
import type { OverviewResponse, FunnelStage, DeptPerformance, SourceItem, TimeToHirePoint, ApplicationsOverTimePoint, ActivityFeedItem } from "@/lib/api/analytics.api"

function mapJobDto(dto: JobListDto): Job {
  const statusMap: Record<string, JobStatus> = {
    DRAFT: "Draft",
    PENDING_APPROVAL: "Draft",
    APPROVED: "Draft",
    SCHEDULED: "Draft",
    PUBLISHED: "Active",
    PAUSED: "Paused",
    CLOSED: "Closed",
    FILLED: "Closed",
    CANCELLED: "Closed",
    ARCHIVED: "Closed",
  }
  return {
    id: dto.id,
    title: dto.title,
    department: dto.department?.name || "",
    location: dto.location ? `${dto.location.city}` : "",
    type: mapEmploymentType(dto.employmentType),
    salaryMin: dto.salaryMin ?? 0,
    salaryMax: dto.salaryMax ?? 0,
    description: dto.description,
    status: statusMap[dto.status] || "Draft",
    applicants: dto._count?.collaborators ?? 0,
    createdAt: dto.createdAt ? new Date(dto.createdAt) : new Date(),
  }
}

function mapEmploymentType(t: string): Job["type"] {
  switch (t) {
    case "FULL_TIME": return "full-time"
    case "PART_TIME": return "part-time"
    case "CONTRACT": return "contract"
    case "INTERNSHIP": return "internship"
    default: return "full-time"
  }
}

export type AddCandidateResult =
  | { status: "candidate-created"; candidateId: string; applicationId: null }
  | { status: "candidate-and-application-created"; candidateId: string; applicationId: string }
  | { status: "candidate-created-application-failed"; candidateId: string; applicationId: null; error: string }
  | { status: "candidate-creation-failed"; candidateId: null; applicationId: null; error: string }

interface AppState {
  jobs: Job[]
  candidates: Candidate[]
  candidatesScoreSummary: CandidateScoreSummary | null
  interviews: Interview[]
  activities: Activity[]
  candidatesLoading: boolean
  candidatesError: string | null
  interviewsLoading: boolean
  interviewsError: string | null
  analyticsOverview: OverviewResponse | null
  analyticsFunnel: FunnelStage[]
  analyticsDepartments: DeptPerformance[]
  analyticsSources: SourceItem[]
  analyticsTimeToHire: TimeToHirePoint[]
  analyticsApplicationsOverTime: ApplicationsOverTimePoint[]
  analyticsLoading: boolean
  analyticsError: string | null
  activitiesLoading: boolean
  addJob: (job: Omit<Job, "id" | "createdAt" | "applicants">) => void
  updateJobStatus: (id: string, status: JobStatus) => void
  addCandidateApplication: (data: {
    name: string
    email: string
    phone?: string
    jobId: string
    jobTitle: string
    experience: number
    skills: string[]
    rating: number
    notes: string
  }) => Promise<AddCandidateResult>
  rejectCandidateApplication: (candidateId: string) => Promise<void>
  advanceCandidateApplication: (candidateId: string, toStatus: string) => Promise<void>
  fetchCandidates: () => Promise<void>
  fetchJobs: () => Promise<void>
  fetchInterviews: () => Promise<void>
  scheduleInterview: (data: {
    applicationId: string
    jobId: string
    type: FrontendInterviewType
    title: string
    scheduledAt: string
    durationMinutes: number
    timezone: string
  }) => Promise<void>
  cancelInterviewById: (id: string) => Promise<void>
  rescheduleInterviewById: (id: string, dto: { scheduledAt: string; durationMinutes?: number; timezone?: string; reason?: string }) => Promise<void>
  recordResultById: (id: string, dto: { result: BackendInterviewResult; resultNotes?: string }) => Promise<void>
  completeInterviewById: (id: string) => Promise<void>
  fetchAnalytics: (dateFrom?: string) => Promise<void>
  fetchActivities: () => Promise<void>
}

async function fetchAllPages<T>(
  fetcher: (params: Record<string, unknown>) => Promise<{ data?: T[]; meta?: { total: number; page: number; limit: number } }>,
  baseParams: Record<string, unknown>,
  maxPages = 5,
): Promise<T[]> {
  const results: T[] = []
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetcher({ ...baseParams, page, limit: 100 })
    results.push(...(res.data || []))
    const meta = res.meta
    if (!meta || results.length >= meta.total) break
  }
  return results
}

async function loadCandidatesWithApplications(): Promise<Candidate[]> {
  const candidateRes = await fetchCandidates({ limit: 50, page: 1, sortBy: "createdAt", sortOrder: "desc" })

  const candidateIds = (candidateRes.data || []).map((c) => c.id)

  const allApps: ApplicationListItem[] = []
  if (candidateIds.length > 0) {
    try {
      const appParams: ApplicationQueryParams = {
        candidateId: candidateIds,
        limit: 100,
      }
      const firstPage = await fetchApplications(appParams)
      allApps.push(...(firstPage.data || []))
      const meta = firstPage.meta
      if (meta && meta.total > (firstPage.data || []).length) {
        const remaining = await fetchAllPages(fetchApplications, { candidateId: candidateIds }, 5)
        allApps.push(...remaining)
      }
    } catch {
      // Applications unavailable; candidates still load without application data
    }
  }

  const appsByCandidateId = new Map<string, ApplicationListItem[]>()
  for (const app of allApps) {
    const cid = app.candidate?.id
    if (cid) {
      const existing = appsByCandidateId.get(cid) || []
      existing.push(app)
      appsByCandidateId.set(cid, existing)
    }
  }

  return (candidateRes.data || []).map((apiCandidate) => {
    const applications = appsByCandidateId.get(apiCandidate.id) || []
    const rawApps = applications.map((app) => ({
      id: app.id,
      candidateId: apiCandidate.id,
      jobId: app.job?.id || "",
      jobTitle: app.job?.title || "",
      status: app.status,
      version: app.version,
      stageId: app.currentStage?.id,
      stageName: app.currentStage?.name,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    }))

    const appInfo = buildApplicationInfo(rawApps)

    return mapCandidateFromApi(apiCandidate, appInfo)
  })
}

let candidatesRequestSequence = 0

function mapCreatedCandidate(api: CandidateApiDetail): Candidate {
  return {
    id: api.id,
    firstName: api.firstName,
    lastName: api.lastName,
    displayName: api.displayName,
    email: api.email || "",
    phone: api.phone || "",
    headline: api.headline || undefined,
    currentJobTitle: api.currentJobTitle || undefined,
    currentEmployer: api.currentEmployer || undefined,
    totalExperienceYears: api.totalExperienceYears ?? 0,
    skills: (api.skills || []).map((s) => ({
      id: s.id,
      skillId: s.skillId,
      name: s.name,
      proficiencyLevel: s.proficiencyLevel,
    })),
    aiScore: null,
    status: "ACTIVE" as CandidateStatus,
    source: api.source || undefined,
    createdAt: new Date(api.createdAt),
    updatedAt: new Date(api.updatedAt),
    applicationSummary: { total: 0, active: 0 },
  }
}

export const useStore = create<AppState>((set, get) => ({
  jobs: [],
  candidates: [],
  candidatesScoreSummary: null,
  interviews: [],
  activities: [],
  candidatesLoading: false,
  candidatesError: null,
  interviewsLoading: false,
  interviewsError: null,
  analyticsOverview: null,
  analyticsFunnel: [],
  analyticsDepartments: [],
  analyticsSources: [],
  analyticsTimeToHire: [],
  analyticsApplicationsOverTime: [],
  analyticsLoading: false,
  analyticsError: null,
  activitiesLoading: false,
  addJob: (job) =>
    set((state) => ({
      jobs: [
        {
          ...job,
          id: `j${Date.now()}`,
          applicants: 0,
          createdAt: new Date(),
        },
        ...state.jobs,
      ],
    })),
  updateJobStatus: (id, status) =>
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? { ...j, status } : j)),
    })),
  fetchJobs: async () => {
    try {
      const res = await getJobs({ limit: 100 })
      set({ jobs: (res.data || []).map(mapJobDto) })
    } catch {
      // jobs stay as-is (possibly empty) on failure
    }
  },
  fetchCandidates: async () => {
    const requestId = ++candidatesRequestSequence
    set({ candidatesLoading: true, candidatesError: null })
    try {
      // Whole-company aggregate runs alongside the paged list; a summary
      // failure must not break the page (the dashboard falls back to the
      // list-based computation).
      const [candidates, scoreSummary] = await Promise.all([
        loadCandidatesWithApplications(),
        fetchCandidatesScoreSummary().catch(() => null),
      ])
      if (requestId !== candidatesRequestSequence) return
      get().fetchJobs()
      set({ candidates, candidatesScoreSummary: scoreSummary, candidatesLoading: false })
    } catch (err) {
      if (requestId !== candidatesRequestSequence) return
      const message = err instanceof Error ? err.message : "Failed to fetch candidates"
      set({ candidatesError: message, candidatesLoading: false })
    }
  },
  addCandidateApplication: async (data) => {
    set({ candidatesLoading: true, candidatesError: null })
    try {
      const nameParts = data.name.trim().split(/\s+/)
      const firstName = nameParts[0]
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : ""

      const dto: CreateCandidateRequest = {
        firstName,
        lastName,
        email: data.email,
        source: "RECRUITER_CREATED",
        currentJobTitle: data.jobTitle || undefined,
        totalExperienceYears: data.experience || undefined,
      }
      if (data.phone) dto.phone = data.phone

      const newCand = await createCandidate(dto)
      const candidateId = newCand.id

      ++candidatesRequestSequence

      const mappedCandidate = mapCreatedCandidate(newCand)

      set((state) => {
        const withoutCreated = state.candidates.filter((c) => c.id !== mappedCandidate.id)
        return { candidates: [mappedCandidate, ...withoutCreated] }
      })

      if (data.jobId) {
        try {
          const app = await createApplication({
            candidateId,
            jobId: data.jobId,
            source: "RECRUITER_CREATED",
          })
          await get().fetchCandidates()
          return { status: "candidate-and-application-created" as const, candidateId, applicationId: app.id }
        } catch (appErr) {
          await get().fetchCandidates()
          const error = appErr instanceof Error ? appErr.message : "Application could not be created"
          return { status: "candidate-created-application-failed" as const, candidateId, applicationId: null, error }
        }
      }

      await get().fetchCandidates()
      return { status: "candidate-created" as const, candidateId, applicationId: null }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create candidate"
      set({ candidatesError: message, candidatesLoading: false })
      return { status: "candidate-creation-failed" as const, candidateId: null, applicationId: null, error: message }
    }
  },
  rejectCandidateApplication: async (candidateId) => {
    const state = get()
    const candidate = state.candidates.find((c) => c.id === candidateId)
    if (!candidate) return

    const currentApp = candidate.applicationSummary?.current
    if (!currentApp) {
      set({ candidatesError: "No active application to reject" })
      return
    }

    set({ candidatesLoading: true, candidatesError: null })
    try {
      const detail = await fetchApplicationById(currentApp.id)
      const version = detail.version

      await rejectApplication(currentApp.id, { expectedVersion: version, reasonCode: "OTHER" })

      const candidates = await loadCandidatesWithApplications()
      set({ candidates, candidatesLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reject application"
      set({ candidatesError: message, candidatesLoading: false })
    }
  },
  advanceCandidateApplication: async (candidateId, toStatus) => {
    const state = get()
    const candidate = state.candidates.find((c) => c.id === candidateId)
    if (!candidate) return

    const currentApp = candidate.applicationSummary?.current
    if (!currentApp) {
      set({ candidatesError: "No active application to advance" })
      return
    }

    set({ candidatesLoading: true, candidatesError: null })
    try {
      const detail = await fetchApplicationById(currentApp.id)
      const version = detail.version

      switch (toStatus) {
        case "Screening":
          if (detail.status === "DRAFT") {
            await submitApplication(currentApp.id, { expectedVersion: version, consentConfirmed: true })
          } else {
            const pipeline = await getJobPipeline(currentApp.jobId)
            const sorted = [...pipeline.stages].sort((a, b) => a.sortOrder - b.sortOrder)
            const target = sorted.find(s => s.name.toLowerCase() === "screening") ?? sorted[0]
            if (target) {
              await moveApplication(currentApp.id, { expectedVersion: version, toStageId: target.id })
            }
          }
          break
        case "Interview":
          await shortlistApplication(currentApp.id, { expectedVersion: version })
          break
        case "Hired":
          await markApplicationHired(currentApp.id, { expectedVersion: version })
          break
        default:
          break
      }

      const candidates = await loadCandidatesWithApplications()
      set({ candidates, candidatesLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update application"
      set({ candidatesError: message, candidatesLoading: false })
    }
  },
  fetchInterviews: async () => {
    set({ interviewsLoading: true, interviewsError: null })
    try {
      await get().fetchJobs()
      const res = await fetchInterviewsApi({ limit: 100, sortBy: "scheduledAt", sortOrder: "desc" })
      const jobsMap = new Map(get().jobs.map((j) => [j.id, j.title]))
      const interviews = (res.data || []).map((item) => mapInterviewListItem(item, jobsMap))
      set({ interviews, interviewsLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch interviews"
      set({ interviewsError: message, interviewsLoading: false })
    }
  },
  scheduleInterview: async (data) => {
    set({ interviewsLoading: true, interviewsError: null })
    try {
      const dto: CreateInterviewRequest = {
        applicationId: data.applicationId,
        type: mapFrontendToBackendType(data.type),
        title: data.title,
        scheduledAt: data.scheduledAt,
        durationMinutes: data.durationMinutes,
        timezone: data.timezone,
      }
      await createInterviewApi(dto)
      await get().fetchInterviews()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to schedule interview"
      set({ interviewsError: message, interviewsLoading: false })
    }
  },
  cancelInterviewById: async (id) => {
    const state = get()
    const interview = state.interviews.find((i) => i.id === id)
    if (!interview) return

    set({ interviewsLoading: true, interviewsError: null })
    try {
      const version = interview.version ?? 1
      await cancelInterviewApi(id, { expectedVersion: version })
      await get().fetchInterviews()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to cancel interview"
      set({ interviewsError: message, interviewsLoading: false })
    }
  },
  rescheduleInterviewById: async (id, dto) => {
    const state = get()
    const interview = state.interviews.find((i) => i.id === id)
    if (!interview) return

    set({ interviewsLoading: true, interviewsError: null })
    try {
      await rescheduleInterviewApi(id, { ...dto, expectedVersion: interview.version ?? 1 })
      await get().fetchInterviews()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reschedule interview"
      set({ interviewsError: message, interviewsLoading: false })
    }
  },
  recordResultById: async (id, dto) => {
    const state = get()
    const interview = state.interviews.find((i) => i.id === id)
    if (!interview) return

    set({ interviewsLoading: true, interviewsError: null })
    try {
      await recordResultApi(id, { ...dto, expectedVersion: interview.version ?? 1 })
      await get().fetchInterviews()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to record result"
      set({ interviewsError: message, interviewsLoading: false })
    }
  },
  completeInterviewById: async (id) => {
    const state = get()
    const interview = state.interviews.find((i) => i.id === id)
    if (!interview) return

    const TERMINAL = ["COMPLETED", "CANCELLED", "NO_SHOW", "EXPIRED"] as const
    if ((TERMINAL as readonly string[]).includes(interview.backendStatus)) {
      set({ interviewsError: `Cannot complete an interview with status ${interview.backendStatus}`, interviewsLoading: false })
      return
    }

    set({ interviewsLoading: true, interviewsError: null })
    try {
      let version = interview.version ?? 1

      const needsConfirm = interview.backendStatus === "SCHEDULED" || interview.backendStatus === "RESCHEDULED"
      const needsStart = needsConfirm || interview.backendStatus === "CONFIRMED"

      if (needsConfirm) {
        await confirmInterviewApi(id, { expectedVersion: version })
        version++
      }
      if (needsStart) {
        await startInterviewApi(id, { expectedVersion: version })
        version++
      }

      await completeInterviewApi(id, { expectedVersion: version })
      await get().fetchInterviews()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to complete interview"
      set({ interviewsError: message, interviewsLoading: false })
    }
  },
  fetchAnalytics: async (dateFrom?: string) => {
    set({ analyticsLoading: true, analyticsError: null })
    try {
      const [overview, funnel, departments, sources, timeToHire, applicationsOverTime] = await Promise.all([
        getAnalyticsOverview(dateFrom),
        getAnalyticsFunnel(dateFrom),
        getAnalyticsDepartments(dateFrom),
        getAnalyticsSources(dateFrom),
        getAnalyticsTimeToHire(dateFrom),
        getApplicationsOverTime(14),
      ])
      set({
        analyticsOverview: overview,
        analyticsFunnel: funnel,
        analyticsDepartments: departments,
        analyticsSources: sources,
        analyticsTimeToHire: timeToHire,
        analyticsApplicationsOverTime: applicationsOverTime,
        analyticsLoading: false,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch analytics"
      set({ analyticsError: message, analyticsLoading: false })
    }
  },
  fetchActivities: async () => {
    set({ activitiesLoading: true })
    try {
      const items: ActivityFeedItem[] = await getRecentActivity(20)
      const eventTypeMap: Record<string, Activity["type"]> = {
        APPLICATION_CREATED: "application",
        APPLICATION_SUBMITTED: "application",
        APPLICATION_STAGE_CHANGED: "application",
        APPLICATION_SHORTLISTED: "application",
        APPLICATION_REJECTED: "rejection",
        APPLICATION_HIRED: "hire",
        APPLICATION_RESUME_UPLOADED: "application",
        COMPANY_CANDIDATE_CREATED: "application",
      }
      const activities: Activity[] = items.map((item) => ({
        id: item.id,
        type: eventTypeMap[item.eventType] ?? "application",
        candidateName: item.candidateName ?? "A candidate",
        message: item.description,
        timestamp: new Date(item.occurredAt),
      }))
      set({ activities, activitiesLoading: false })
    } catch {
      // Activities are non-critical; silently fail so the dashboard still loads
      set({ activitiesLoading: false })
    }
  },
}))
