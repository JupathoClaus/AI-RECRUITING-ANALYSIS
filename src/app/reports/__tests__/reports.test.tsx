import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import ReportsPage from "../page"

// Mock the API modules
vi.mock("@/lib/api/reports.api", () => ({
  getCandidateEvaluation: vi.fn(),
  getInterviewSummary: vi.fn(),
  getPipeline: vi.fn(),
  getTimeToHire: vi.fn(),
  getSourceEffectiveness: vi.fn(),
  getJobSummary: vi.fn(),
  getActivity: vi.fn(),
  getJobFilterOptions: vi.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0, totalPages: 0, hasMore: false } }),
  getDepartmentFilterOptions: vi.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0, totalPages: 0, hasMore: false } }),
  downloadReportCsv: vi.fn(),
}))

vi.mock("@/lib/api/jobs.api", () => ({ getJobs: vi.fn().mockResolvedValue({ data: [] }) }))
vi.mock("@/lib/api/company.api", () => ({ getDepartments: vi.fn().mockResolvedValue({ data: [] }) }))
vi.mock("@/store/notification-store", () => ({ useNotificationStore: () => ({ unreadCount: 0, fetchUnreadCount: vi.fn(), decrementUnread: vi.fn(), resetUnread: vi.fn() }) }))
vi.mock("@/components/layout/app-layout", () => ({ AppLayout: ({ title, children }: any) => <div><h1>{title}</h1>{children}</div> }))
vi.mock("@/components/ui/card", () => ({ Card: ({ children, onClick }: any) => <div onClick={onClick}>{children}</div>, CardContent: ({ children }: any) => <div>{children}</div>, CardHeader: ({ children }: any) => <div>{children}</div>, CardTitle: ({ children }: any) => <div>{children}</div>, CardDescription: ({ children }: any) => <div>{children}</div> }))
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onClick, disabled }: any) => <button onClick={onClick} disabled={disabled}>{children}</button> }))
vi.mock("@/components/ui/badge", () => ({ Badge: ({ children }: any) => <span>{children}</span> }))
vi.mock("@/components/ui/skeleton", () => ({ Skeleton: ({ className }: any) => <div className={className} /> }))
vi.mock("@/components/ui/table", () => ({ Table: ({ children }: any) => <table>{children}</table>, TableHeader: ({ children }: any) => <thead>{children}</thead>, TableBody: ({ children }: any) => <tbody>{children}</tbody>, TableRow: ({ children }: any) => <tr>{children}</tr>, TableHead: ({ children }: any) => <th>{children}</th>, TableCell: ({ children }: any) => <td>{children}</td> }))
vi.mock("@/components/ui/input", () => ({ Input: (props: any) => <input {...props} /> }))

import * as reportsApi from "@/lib/api/reports.api"

const mockReportsApi = vi.mocked(reportsApi)

describe("ReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReportsApi.getCandidateEvaluation.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } })
    mockReportsApi.getInterviewSummary.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } })
    mockReportsApi.getPipeline.mockResolvedValue({ stages: [], totalApplications: 0, hiredCount: 0, rejectedCount: 0, activeCount: 0 })
    mockReportsApi.getTimeToHire.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } })
    mockReportsApi.getSourceEffectiveness.mockResolvedValue([])
    mockReportsApi.getJobSummary.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } })
    mockReportsApi.getActivity.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } })
  })

  it("renders without crashing", () => {
    render(<ReportsPage />)
    expect(screen.getByText("Reports")).toBeDefined()
  })

  it("shows selectable report cards", () => {
    render(<ReportsPage />)
    expect(screen.getByText("Candidate Evaluation Report")).toBeDefined()
    expect(screen.getByText("Interview Summary Report")).toBeDefined()
  })

  it("selecting a report triggers the correct API", async () => {
    render(<ReportsPage />)
    const candidateCard = screen.getByText("Candidate Evaluation Report")
    candidateCard.click()
    await waitFor(() => {
      expect(mockReportsApi.getCandidateEvaluation).toHaveBeenCalled()
    })
  })

  it("Diversity report makes no API call", async () => {
    render(<ReportsPage />)
    const diversityCard = screen.getByText("Diversity & Inclusion Report")
    diversityCard.click()
    await waitFor(() => {
      expect(mockReportsApi.getCandidateEvaluation).not.toHaveBeenCalled()
    })
  })
})
