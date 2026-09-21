import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScreeningResultView } from '../screening-result-view'
import type { AiScreeningResultDto } from '@/lib/api/ai-screening.api'

function result(overrides?: Partial<AiScreeningResultDto>): AiScreeningResultDto {
  return {
    id: 's1',
    applicationId: 'a1',
    status: 'COMPLETED',
    createdAt: '2025-01-01T00:00:00Z',
    completedAt: '2025-01-01T01:00:00Z',
    ...overrides,
  }
}

describe('ScreeningResultView', () => {
  it('renders title', () => {
    render(<ScreeningResultView result={result()} />)
    expect(screen.getByText('Screening Result')).toBeDefined()
  })

  it('renders SHORTLIST recommendation badge', () => {
    render(<ScreeningResultView result={result({ recommendation: 'SHORTLIST' })} />)
    expect(screen.getByText('Recommended for shortlist')).toBeDefined()
  })

  it('renders NOT_SHORTLIST recommendation badge', () => {
    render(<ScreeningResultView result={result({ recommendation: 'NOT_SHORTLIST' })} />)
    expect(screen.getByText('Not recommended for shortlist')).toBeDefined()
  })

  it('renders HUMAN_REVIEW recommendation badge', () => {
    render(<ScreeningResultView result={result({ recommendation: 'HUMAN_REVIEW' })} />)
    expect(screen.getByText('Human review required')).toBeDefined()
  })

  it('renders nothing when recommendation is absent', () => {
    render(<ScreeningResultView result={result({ recommendation: undefined })} />)
    expect(screen.queryByText('Recommended for shortlist')).toBeNull()
    expect(screen.queryByText('Not recommended for shortlist')).toBeNull()
    expect(screen.queryByText('Human review required')).toBeNull()
  })

  it('renders overall score with Progress', () => {
    render(<ScreeningResultView result={result({ overallScore: 75 })} />)
    expect(screen.getByText('Overall Score')).toBeDefined()
    expect(screen.getByText('75 out of 100')).toBeDefined()
  })

  it('renders nothing when overallScore is not set', () => {
    render(<ScreeningResultView result={result({ overallScore: undefined })} />)
    expect(screen.queryByText('Overall Score')).toBeNull()
  })

  it('renders confidence', () => {
    render(<ScreeningResultView result={result({ confidence: 'HIGH' })} />)
    expect(screen.getByText('HIGH')).toBeDefined()
  })

  it('renders explanation', () => {
    render(<ScreeningResultView result={result({ explanation: 'Strong candidate' })} />)
    expect(screen.getByText('Strong candidate')).toBeDefined()
  })

  it('renders matched qualifications', () => {
    render(<ScreeningResultView result={result({ matchedQualifications: ['React', 'TypeScript'] })} />)
    expect(screen.getByText('React')).toBeDefined()
    expect(screen.getByText('TypeScript')).toBeDefined()
  })

  it('does not render matched section when empty', () => {
    render(<ScreeningResultView result={result({ matchedQualifications: [] })} />)
    expect(screen.queryByText('Matched Qualifications')).toBeNull()
  })

  it('renders missing qualifications', () => {
    render(<ScreeningResultView result={result({ missingQualifications: ['Docker'] })} />)
    expect(screen.getByText('Docker')).toBeDefined()
  })

  it('does not render missing section when empty', () => {
    render(<ScreeningResultView result={result({ missingQualifications: [] })} />)
    expect(screen.queryByText('Missing Qualifications')).toBeNull()
  })

  it('renders criteria scores', () => {
    render(
      <ScreeningResultView
        result={result({
          criteriaScores: [{ criterion: 'Experience', score: 8, maximumScore: 10, weight: 1, explanation: 'Good' }],
        })}
      />,
    )
    expect(screen.getByText('Experience')).toBeDefined()
    expect(screen.getByText('8/10')).toBeDefined()
    expect(screen.getByText('Good')).toBeDefined()
  })

  it('does not render criteria section when empty', () => {
    render(<ScreeningResultView result={result({ criteriaScores: [] })} />)
    expect(screen.queryByText('Criteria Scores')).toBeNull()
  })

  it('renders evidence entries', () => {
    render(
      <ScreeningResultView
        result={result({
          evidence: [{ criterion: 'Leadership', sourceCategory: 'Resume', sourceText: 'Led team', assessment: 'Positive', score: 7, weight: 1, isRequired: false }],
        })}
      />,
    )
    expect(screen.getByText('Leadership')).toBeDefined()
    expect(screen.getByText('Source: Led team')).toBeDefined()
    expect(screen.getByText('Positive')).toBeDefined()
  })

  it('does not render evidence section when empty', () => {
    render(<ScreeningResultView result={result({ evidence: [] })} />)
    expect(screen.queryByText('Evidence')).toBeNull()
  })

  it('renders uncertainties', () => {
    render(<ScreeningResultView result={result({ uncertainties: ['Unclear career progression'] })} />)
    expect(screen.getByText(/Unclear career progression/)).toBeDefined()
  })

  it('does not render uncertainties when empty', () => {
    render(<ScreeningResultView result={result({ uncertainties: [] })} />)
    expect(screen.queryByText('Uncertainties')).toBeNull()
  })

  it('renders risk flags', () => {
    render(<ScreeningResultView result={result({ riskFlags: ['Overqualified'] })} />)
    expect(screen.getByText('Overqualified')).toBeDefined()
  })

  it('does not render risk flags when empty', () => {
    render(<ScreeningResultView result={result({ riskFlags: [] })} />)
    expect(screen.queryByText('Risk Flags')).toBeNull()
  })

  it('renders completedAt date', () => {
    render(<ScreeningResultView result={result({ completedAt: '2025-06-15T10:30:00Z' })} />)
    expect(screen.getByText(/2025/)).toBeDefined()
  })

  it('renders advisory notice', () => {
    render(<ScreeningResultView result={result()} />)
    const notice = screen.getByText(/decision support/i)
    expect(notice).toBeDefined()
  })

  it('renders criterion evaluations with verification status', () => {
    render(
      <ScreeningResultView
        result={result({
          criterionEvaluations: [
            {
              criterionId: 'c1',
              criterion: 'TypeScript',
              requirementType: 'REQUIRED',
              status: 'FULLY_MET',
              reason: '5 years of TypeScript experience on resume',
              confidence: 'HIGH',
              evidence: [
                {
                  sourceCategory: 'RESUME',
                  sourceText: 'Built TypeScript apps at ABC Ltd',
                  verificationStatus: 'VERBATIM',
                },
              ],
            },
          ],
        })}
      />,
    )
    expect(screen.getByText('Why this score?')).toBeDefined()
    expect(screen.getByText('TypeScript')).toBeDefined()
    expect(screen.getByText('Fully met')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /TypeScript/ }))
    expect(screen.getByText('5 years of TypeScript experience on resume')).toBeDefined()
    expect(screen.getByText('Verbatim')).toBeDefined()
  })

  it('does not render why this score when no criterion evaluations', () => {
    render(<ScreeningResultView result={result({ criterionEvaluations: [] })} />)
    expect(screen.queryByText('Why this score?')).toBeNull()
  })
})
