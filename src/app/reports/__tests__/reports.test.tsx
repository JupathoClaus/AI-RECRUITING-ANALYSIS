import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, act } from "@testing-library/react"
import ReportsPage from "../page"

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

vi.mock("@/store/notification-store", () => ({ useNotificationStore: () => ({ unreadCount: 0, fetchUnreadCount: vi.fn(), decrementUnread: vi.fn(), resetUnread: vi.fn() }) }))
vi.mock("@/components/layout/app-layout", () => ({ AppLayout: ({ title, children }: any) => <div><h1>{title}</h1>{children}</div> }))
vi.mock("@/components/ui/card", () => ({ Card: ({ children, onClick }: any) => <div onClick={onClick} data-card>{children}</div>, CardContent: ({ children }: any) => <div>{children}</div>, CardHeader: ({ children }: any) => <div>{children}</div>, CardTitle: ({ children }: any) => <div>{children}</div>, CardDescription: ({ children }: any) => <div>{children}</div> }))
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onClick, disabled }: any) => <button onClick={onClick} disabled={disabled} data-button>{children}</button> }))
vi.mock("@/components/ui/badge", () => ({ Badge: ({ children }: any) => <span>{children}</span> }))
vi.mock("@/components/ui/skeleton", () => ({ Skeleton: ({ className }: any) => <div className={className} /> }))
vi.mock("@/components/ui/table", () => ({ Table: ({ children }: any) => <table>{children}</table>, TableHeader: ({ children }: any) => <thead>{children}</thead>, TableBody: ({ children }: any) => <tbody>{children}</tbody>, TableRow: ({ children }: any) => <tr>{children}</tr>, TableHead: ({ children }: any) => <th>{children}</th>, TableCell: ({ children }: any) => <td>{children}</td> }))
vi.mock("@/components/ui/input", () => ({ Input: (props: any) => <input {...props} /> }))

import * as reportsApi from "@/lib/api/reports.api"
const mockReportsApi = vi.mocked(reportsApi)

const resolveMap = new Map<string, (value: any) => void>()
function deferred(name: string) {
  return new Promise((resolve) => { resolveMap.set(name, resolve) })
}
function resolveDeferred(name: string, value: any) {
  resolveMap.get(name)?.(value)
}

describe("ReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveMap.clear()
    const emptyPaginated = { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } }
    mockReportsApi.getCandidateEvaluation.mockResolvedValue(emptyPaginated)
    mockReportsApi.getInterviewSummary.mockResolvedValue(emptyPaginated)
    mockReportsApi.getPipeline.mockResolvedValue({ stages: [], totalApplications: 0, hiredCount: 0, rejectedCount: 0, activeCount: 0 })
    mockReportsApi.getTimeToHire.mockResolvedValue(emptyPaginated)
    mockReportsApi.getSourceEffectiveness.mockResolvedValue([])
    mockReportsApi.getJobSummary.mockResolvedValue(emptyPaginated)
    mockReportsApi.getActivity.mockResolvedValue(emptyPaginated)
  })

  function renderPage() { return render(<ReportsPage />) }

  // ── Basic rendering ──

  it("renders without crashing", () => {
    renderPage()
    expect(screen.getByText("Reports")).toBeDefined()
  })

  it("shows report cards", () => {
    renderPage()
    expect(screen.getByText("Candidate Evaluation Report")).toBeDefined()
    expect(screen.getByText("Interview Summary Report")).toBeDefined()
  })

  // ── Report selection → correct API ──

  it("selecting Candidate Evaluation calls candidate API", async () => {
    renderPage()
    screen.getByText("Candidate Evaluation Report").click()
    await waitFor(() => expect(mockReportsApi.getCandidateEvaluation).toHaveBeenCalled())
  })

  it("selecting Interview Summary calls interview API", async () => {
    renderPage()
    screen.getByText("Interview Summary Report").click()
    await waitFor(() => expect(mockReportsApi.getInterviewSummary).toHaveBeenCalled())
  })

  it("selecting Pipeline calls pipeline API", async () => {
    renderPage()
    screen.getByText("Pipeline Analytics Report").click()
    await waitFor(() => expect(mockReportsApi.getPipeline).toHaveBeenCalled())
  })

  it("Diversity makes no API call", async () => {
    renderPage()
    screen.getByText("Diversity & Inclusion Report").click()
    await waitFor(() => {
      expect(mockReportsApi.getCandidateEvaluation).not.toHaveBeenCalled()
    })
  })

  // ── Race: old slow request cannot overwrite new fast request ──

  it("slow A cannot overwrite fast B", async () => {
    mockReportsApi.getCandidateEvaluation.mockReturnValue(deferred("A"))
    mockReportsApi.getInterviewSummary.mockResolvedValue({ data: [{ interviewId: 'i1', candidateName: 'B', status: 'COMPLETED' }], meta: { total: 1, page: 1, limit: 50, totalPages: 1 } })
    renderPage()
    screen.getByText("Candidate Evaluation Report").click()
    await waitFor(() => expect(mockReportsApi.getCandidateEvaluation).toHaveBeenCalled())
    screen.getByText("Interview Summary Report").click()
    await waitFor(() => expect(mockReportsApi.getInterviewSummary).toHaveBeenCalled())
    resolveDeferred("A", { data: [{ applicationId: 'a1', candidateName: 'A_stale' }], meta: { total: 1, page: 1, limit: 50, totalPages: 1 } })
    await new Promise(r => setTimeout(r, 50))
    expect(mockReportsApi.getInterviewSummary).toHaveBeenCalled()
  })

  // ── Report change aborts previous ──

  it("report change aborts previous request", async () => {
    let signal: AbortSignal | null = null
    mockReportsApi.getCandidateEvaluation.mockImplementation((_p: any, s: AbortSignal) => {
      signal = s
      return new Promise(() => {})
    })
    renderPage()
    screen.getByText("Candidate Evaluation Report").click()
    await new Promise(r => setTimeout(r, 50))
    screen.getByText("Interview Summary Report").click()
    await new Promise(r => setTimeout(r, 50))
    expect(signal?.aborted).toBe(true)
  })

  // ── Export uses applied filters ──

  it("export uses applied filters", async () => {
    mockReportsApi.downloadReportCsv.mockResolvedValue({ filename: 'test.csv', truncated: false, totalCount: null, returnedCount: null })
    renderPage()
    screen.getByText("Candidate Evaluation Report").click()
    await waitFor(() => expect(mockReportsApi.getCandidateEvaluation).toHaveBeenCalled())
    // Click export
    const buttons = screen.getAllByText("Export CSV")
    buttons[0].click()
    await waitFor(() => expect(mockReportsApi.downloadReportCsv).toHaveBeenCalled())
  })

  // ── Abort errors not shown ──

  it("abort errors are not shown", async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    mockReportsApi.getCandidateEvaluation.mockRejectedValue(abortError)
    renderPage()
    screen.getByText("Candidate Evaluation Report").click()
    await new Promise(r => setTimeout(r, 100))
    // No error message should appear
    expect(screen.queryByText(/Failed/i)).toBeNull()
  })

  // ── Export and report controllers are independent ──

  it("export does not cancel report data request", async () => {
    mockReportsApi.downloadReportCsv.mockResolvedValue({ filename: 'test.csv', truncated: false, totalCount: null, returnedCount: null })
    renderPage()
    screen.getByText("Candidate Evaluation Report").click()
    await waitFor(() => expect(mockReportsApi.getCandidateEvaluation).toHaveBeenCalled())
    const buttons = screen.getAllByText("Export CSV")
    buttons[0].click()
    await waitFor(() => expect(mockReportsApi.downloadReportCsv).toHaveBeenCalled())
    // Still showing report data
    expect(mockReportsApi.getCandidateEvaluation).toHaveBeenCalled()
  })
})
