import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScreeningProgress } from '../screening-progress'

describe('ScreeningProgress', () => {
  it('renders fallback for IDLE state', () => {
    render(<ScreeningProgress workflowState="IDLE" />)
    expect(screen.getByText('Processing')).toBeDefined()
  })

  it('renders fallback for APPLICATION_SELECTED', () => {
    render(<ScreeningProgress workflowState="APPLICATION_SELECTED" />)
    expect(screen.getByText('Processing')).toBeDefined()
  })

  it('renders fallback for RESUME_MISSING', () => {
    render(<ScreeningProgress workflowState="RESUME_MISSING" />)
    expect(screen.getByText('Processing')).toBeDefined()
  })

  it('renders fallback for ERROR', () => {
    render(<ScreeningProgress workflowState="ERROR" />)
    expect(screen.getByText('Processing')).toBeDefined()
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
