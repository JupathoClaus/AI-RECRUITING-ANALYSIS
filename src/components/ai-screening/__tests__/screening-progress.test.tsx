import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScreeningProgress } from '../screening-progress'

describe('ScreeningProgress', () => {
  it('renders nothing for IDLE state', () => {
    const { container } = render(<ScreeningProgress workflowState="IDLE" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for APPLICATION_SELECTED', () => {
    const { container } = render(<ScreeningProgress workflowState="APPLICATION_SELECTED" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for RESUME_MISSING', () => {
    const { container } = render(<ScreeningProgress workflowState="RESUME_MISSING" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for ERROR', () => {
    const { container } = render(<ScreeningProgress workflowState="ERROR" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders "Reading resume" for WAITING_FOR_EXTRACTION', () => {
    render(<ScreeningProgress workflowState="WAITING_FOR_EXTRACTION" />)
    expect(screen.getByText('Reading resume')).toBeDefined()
  })

  it('renders "Screening queued" for REQUESTING_SCREENING', () => {
    render(<ScreeningProgress workflowState="REQUESTING_SCREENING" />)
    expect(screen.getByText('Screening queued')).toBeDefined()
  })

  it('renders "Screening queued" for SCREENING_PENDING', () => {
    render(<ScreeningProgress workflowState="SCREENING_PENDING" />)
    expect(screen.getByText('Screening queued')).toBeDefined()
  })

  it('renders "Evaluating" for SCREENING_RUNNING', () => {
    render(<ScreeningProgress workflowState="SCREENING_RUNNING" />)
    expect(screen.getByText('Evaluating job-related qualifications')).toBeDefined()
  })

  it('shows auto-update message for known states', () => {
    render(<ScreeningProgress workflowState="SCREENING_RUNNING" />)
    expect(screen.getByText('This may take a moment. The page will update automatically.')).toBeDefined()
  })
})
