import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ApplicationTable } from '../application-table'
import type { ApplicationListItem } from '@/lib/api/applications.api'

// next/link renders as <a> in jsdom
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

function makeApp(overrides: Partial<ApplicationListItem> = {}): ApplicationListItem {
  return {
    id: 'app-1',
    applicationNumber: 'APP-001',
    status: 'SUBMITTED',
    source: 'DIRECT',
    submittedAt: '2026-01-15T10:00:00Z',
    createdAt: '2026-01-15T09:00:00Z',
    updatedAt: '2026-01-15T09:00:00Z',
    version: 1,
    candidate: {
      id: 'c-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      displayName: 'Ada Lovelace',
      headline: null,
    },
    job: { id: 'j-1', title: 'Software Engineer', jobCode: 'JOB-001' },
    currentStage: { id: 's-1', name: 'Applied', type: 'APPLIED' },
    activeFlags: [],
    screeningAnswerCount: 0,
    latestScreening: null,
    ...overrides,
  }
}

describe('ApplicationTable – AI screening column', () => {
  it('shows "Not screened" when latestScreening is null', () => {
    render(<ApplicationTable applications={[makeApp({ latestScreening: null })]} showJob={false} />)
    expect(screen.getByText('Not screened')).toBeDefined()
  })

  it('shows COMPLETED badge when latestScreening status is COMPLETED', () => {
    render(
      <ApplicationTable
        applications={[makeApp({ latestScreening: { id: 'sr-1', status: 'COMPLETED' } })]}
        showJob={false}
      />,
    )
    expect(screen.getByText('Completed')).toBeDefined()
  })

  it('shows PENDING badge when latestScreening status is PENDING', () => {
    render(
      <ApplicationTable
        applications={[makeApp({ latestScreening: { id: 'sr-2', status: 'PENDING' } })]}
        showJob={false}
      />,
    )
    expect(screen.getByText('Pending')).toBeDefined()
  })

  it('shows RUNNING badge when latestScreening status is RUNNING', () => {
    render(
      <ApplicationTable
        applications={[makeApp({ latestScreening: { id: 'sr-3', status: 'RUNNING' } })]}
        showJob={false}
      />,
    )
    expect(screen.getByText('Running')).toBeDefined()
  })

  it('shows FAILED badge when latestScreening status is FAILED', () => {
    render(
      <ApplicationTable
        applications={[makeApp({ latestScreening: { id: 'sr-4', status: 'FAILED' } })]}
        showJob={false}
      />,
    )
    expect(screen.getByText('Failed')).toBeDefined()
  })

  it('renders AI screening column header', () => {
    render(<ApplicationTable applications={[makeApp()]} showJob={false} />)
    expect(screen.getByText('AI screening')).toBeDefined()
  })

  it('renders the candidate name and application number', () => {
    render(<ApplicationTable applications={[makeApp()]} showJob={false} />)
    expect(screen.getByText('Ada Lovelace')).toBeDefined()
    expect(screen.getByText('Application #APP-001')).toBeDefined()
  })

  it('renders a link to open the application workspace', () => {
    render(<ApplicationTable applications={[makeApp()]} showJob={false} />)
    const link = screen.getByRole('link', { name: /open application for ada lovelace/i })
    expect(link.getAttribute('href')).toBe('/applications/app-1')
  })

  it('renders multiple rows without mixing up screening statuses', () => {
    const apps = [
      makeApp({ id: 'a1', latestScreening: { id: 'sr-1', status: 'COMPLETED' } }),
      makeApp({ id: 'a2', latestScreening: { id: 'sr-2', status: 'FAILED' } }),
      makeApp({ id: 'a3', latestScreening: null }),
    ]
    render(<ApplicationTable applications={apps} showJob={false} />)
    expect(screen.getByText('Completed')).toBeDefined()
    expect(screen.getByText('Failed')).toBeDefined()
    expect(screen.getByText('Not screened')).toBeDefined()
  })
})
