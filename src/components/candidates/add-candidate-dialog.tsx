'use client'

import * as React from 'react'
import { useCallback, useRef, useState, startTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { ModalHeader } from '@/components/ui/modal-header'
import { ResumeUploadArea } from '@/components/ai-screening/resume-upload-area'
import { ScreeningProgress } from '@/components/ai-screening/screening-progress'
import { ScreeningResultView } from '@/components/ai-screening/screening-result-view'
import { TickCircle, DocumentText, Warning2, Refresh } from 'iconsax-react'
import { useAiScreening } from '@/lib/ai-screening/use-ai-screening'
import {
  createCandidateWorkflow,
  describeWorkflowError,
  type RecruiterWorkflowResult,
  type WorkflowErrorCopy,
} from '@/lib/api/candidates.api'
import { getResumeExtractionStatus, retryAiScreeningExtraction } from '@/lib/api/ai-screening.api'
import { useStore } from '@/store/useStore'
import type { Job } from '@/types'

type FlowPhase = 'idle' | 'submitting' | 'success' | 'screening-in-progress' | 'screening-done' | 'failed'

type ResumeStatus = 'checking' | 'processing' | 'ready' | 'failed' | 'none'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobs: Job[]
  onComplete: () => void
}

const EXTRACTION_POLL_INTERVAL_MS = 2000

export function AddCandidateDialog({ open, onOpenChange, jobs, onComplete }: Props) {
  const fetchCandidates = useStore((s) => s.fetchCandidates)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [experience, setExperience] = useState('')
  const [selectedJobId, setSelectedJobId] = useState('')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<FlowPhase>('idle')
  const [error, setError] = useState<WorkflowErrorCopy | null>(null)
  const [result, setResult] = useState<RecruiterWorkflowResult | null>(null)
  const [resumeStatus, setResumeStatus] = useState<ResumeStatus>('none')
  const [retryPending, setRetryPending] = useState(false)
  const [extractionRetryPending, setExtractionRetryPending] = useState(false)
  const [progressStage, setProgressStage] = useState(0)

  const submitLock = useRef(false)
  const screenLock = useRef(false)
  const extractionRetryPendingRef = useRef(false)
  const extractionPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const workflowKeyRef = useRef<string>('')
  const pollActiveRef = useRef(false)

  const screening = useAiScreening()

  const job = jobs.find((j) => j.id === selectedJobId)
  const activeJobs = React.useMemo(() => jobs.filter((item) => item.status === 'Active'), [jobs])

  const clearTimers = useCallback(() => {
    pollActiveRef.current = false
    if (extractionPollTimerRef.current) {
      clearTimeout(extractionPollTimerRef.current)
      extractionPollTimerRef.current = null
    }
    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current)
      progressTimerRef.current = null
    }
  }, [])

  const fullReset = useCallback(() => {
    clearTimers()
    setName('')
    setEmail('')
    setPhone('')
    setExperience('')
    setSelectedJobId('')
    setResumeFile(null)
    setPhase('idle')
    setError(null)
    setResult(null)
    setResumeStatus('none')
    setRetryPending(false)
    setExtractionRetryPending(false)
    setProgressStage(0)
    submitLock.current = false
    screenLock.current = false
    workflowKeyRef.current = ''
    screening.selectApplication('')
  }, [clearTimers, screening])

  const prevOpenRef = useRef<boolean>(open)
  React.useEffect(() => {
    const wasOpen = prevOpenRef.current
    prevOpenRef.current = open
    if (wasOpen && !open) startTransition(() => fullReset())
  }, [open, fullReset])

  // Clear the workflow key whenever the user edits the form after a failed
  // attempt: the retry button keeps the SAME key (safe idempotent replay),
  // but a genuinely different submission must get a fresh key.
  const invalidateKeyOnEdit = useCallback(() => {
    if (workflowKeyRef.current) workflowKeyRef.current = ''
  }, [])

  const ensureWorkflowKey = useCallback(() => {
    if (!workflowKeyRef.current) workflowKeyRef.current = `candidate-workflow:${crypto.randomUUID()}`
  }, [])

  // Staged progress copy while the single workflow request is in flight.
  React.useEffect(() => {
    if (phase !== 'submitting') return
    setProgressStage(0)
    progressTimerRef.current = setTimeout(() => setProgressStage(1), 2000)
    const t2 = setTimeout(() => setProgressStage(2), 6000)
    const t3 = setTimeout(() => setProgressStage(3), 12000)
    return () => { clearTimeout(t2); clearTimeout(t3) }
  }, [phase])

  // Poll the extraction status ONLY for display. Closing the dialog is always
  // allowed; extraction continues in the background regardless.
  const pollExtractionStatus = useCallback((applicationId: string) => {
    pollActiveRef.current = true
    const run = async () => {
      if (!pollActiveRef.current) return
      try {
        const extraction = await getResumeExtractionStatus(applicationId)
        if (!pollActiveRef.current) return
        if (extraction.status === 'COMPLETED') {
          setResumeStatus('ready')
          return
        }
        if (extraction.status === 'FAILED') {
          setResumeStatus('failed')
          return
        }
        setResumeStatus('processing')
      } catch {
        if (!pollActiveRef.current) return
        setResumeStatus('processing')
      }
      if (!pollActiveRef.current) return
      extractionPollTimerRef.current = setTimeout(() => run(), EXTRACTION_POLL_INTERVAL_MS)
    }
    void run()
  }, [])

  React.useEffect(() => () => clearTimers(), [clearTimers])

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim() || !selectedJobId || !resumeFile || submitLock.current) return
    submitLock.current = true
    setError(null)
    setPhase('submitting')

    try {
      ensureWorkflowKey()
      const parts = name.trim().split(/\s+/)
      const res = await createCandidateWorkflow(
        {
          firstName: parts[0],
          lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
          email: email.trim(),
          phone: phone || undefined,
          totalExperienceYears: experience ? Number(experience) : undefined,
          jobId: selectedJobId,
        },
        resumeFile,
        workflowKeyRef.current || undefined,
      )
      setResult(res)
      screening.selectApplication(res.applicationId)
      setResumeStatus('checking')
      pollExtractionStatus(res.applicationId)
      setPhase('success')
    } catch (err) {
      setError(describeWorkflowError(err))
      setPhase('failed')
    } finally {
      submitLock.current = false
    }
  }

  const handleRetry = async () => {
    if (submitLock.current) return
    if (!name.trim() || !email.trim() || !selectedJobId || !resumeFile) {
      setError({ title: 'Missing information', detail: 'All required fields must be filled.', retryable: true })
      setPhase('failed')
      return
    }
    submitLock.current = true
    setRetryPending(true)
    setError(null)
    setPhase('submitting')
    try {
      ensureWorkflowKey()
      const parts = name.trim().split(/\s+/)
      const res = await createCandidateWorkflow(
        {
          firstName: parts[0],
          lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
          email: email.trim(),
          phone: phone || undefined,
          totalExperienceYears: experience ? Number(experience) : undefined,
          jobId: selectedJobId,
        },
        resumeFile,
        workflowKeyRef.current || undefined,
      )
      setResult(res)
      screening.selectApplication(res.applicationId)
      setResumeStatus('checking')
      pollExtractionStatus(res.applicationId)
      setPhase('success')
    } catch (err) {
      setError(describeWorkflowError(err))
      setPhase('failed')
    } finally {
      submitLock.current = false
      setRetryPending(false)
    }
  }

  const handleRetryExtraction = async () => {
    if (extractionRetryPendingRef.current || !result?.applicationId) return
    extractionRetryPendingRef.current = true
    setExtractionRetryPending(true)
    setResumeStatus('processing')
    try {
      await retryAiScreeningExtraction(result.applicationId)
      setResumeStatus('checking')
      pollExtractionStatus(result.applicationId)
    } catch {
      setResumeStatus('failed')
    } finally {
      extractionRetryPendingRef.current = false
      setExtractionRetryPending(false)
    }
  }

  const handleStartScreening = async () => {
    if (screenLock.current) return
    screenLock.current = true
    setPhase('screening-in-progress')
    setError(null)
    try {
      await screening.requestScreening()
    } catch {
      setPhase('failed')
      setError({ title: 'AI screening could not start', detail: 'Try again from the candidate detail view.', retryable: false })
    } finally {
      screenLock.current = false
    }
  }

  const handleRetryScreening = async () => {
    if (screenLock.current) return
    screenLock.current = true
    setPhase('screening-in-progress')
    setError(null)
    try {
      await screening.requestScreening()
    } catch {
      setPhase('screening-done')
    } finally {
      screenLock.current = false
    }
  }

  React.useEffect(() => {
    if (phase !== 'screening-in-progress') return
    const ws = screening.state.workflowState
    startTransition(() => {
      if (ws === 'SCREENING_COMPLETED' || ws === 'SCREENING_FAILED') {
        setPhase('screening-done')
      }
    })
  }, [phase, screening.state.workflowState])

  const handleClose = () => {
    clearTimers()
    fetchCandidates()
    onComplete()
    onOpenChange(false)
  }

  const handleCancel = () => {
    if (submitLock.current || screenLock.current) return
    onOpenChange(false)
  }

  const formValid = !!(name.trim() && email.trim() && selectedJobId && resumeFile)
  const busy = phase === 'submitting'

  const progressLabel =
    progressStage === 0 ? 'Creating candidate...' :
    progressStage === 1 ? 'Uploading resume...' :
    progressStage === 2 ? 'Saving resume and linking application...' :
    'Finishing...'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <ModalHeader>
          <DialogTitle>Add New Candidate</DialogTitle>
          <DialogDescription>
            Add a candidate, apply to a job, and upload their resume. The candidate appears in your list as soon as the resume is safely stored — resume reading continues in the background.
          </DialogDescription>
        </ModalHeader>

        {error && phase !== 'failed' && (
          <div className="rounded-lg border border-error/30 bg-error/5 text-error-foreground px-4 py-3 text-sm">
            <p className="font-medium">{error.title}</p>
            <p className="mt-1 text-xs text-error-foreground/90">{error.detail}</p>
          </div>
        )}

        {phase === 'idle' && (
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Full Name *</label>
                <Input placeholder="e.g. John Smith" value={name}
                  onChange={(e) => { setName(e.target.value); invalidateKeyOnEdit() }} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Email *</label>
                <Input type="email" placeholder="john@example.com" value={email}
                  onChange={(e) => { setEmail(e.target.value); invalidateKeyOnEdit() }} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Phone</label>
                <Input type="tel" placeholder="+1 555-0100" value={phone}
                  onChange={(e) => { setPhone(e.target.value); invalidateKeyOnEdit() }} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Years of Experience</label>
                <Input type="number" placeholder="5" min={0} value={experience}
                  onChange={(e) => { setExperience(e.target.value); invalidateKeyOnEdit() }} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Applying For <span className="text-error">*</span>
              </label>
              <Select value={selectedJobId} onValueChange={(v) => { setSelectedJobId(v); invalidateKeyOnEdit() }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a position" />
                </SelectTrigger>
                <SelectContent>
                  {activeJobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.title}{j.department ? ` — ${j.department}` : ''}
                    </SelectItem>
                  ))}
                  {jobs.filter((item) => item.status !== 'Active').map((j) => (
                    <SelectItem key={j.id} value={j.id} disabled>
                      {j.title}{j.department ? ` — ${j.department}` : ''} ({j.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeJobs.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No published jobs are accepting applications. Unavailable jobs are listed above with their status;
                  publish a job in the Jobs section to make it selectable.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Candidate Resume / CV <span className="text-error">*</span>
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Select the candidate&apos;s resume. TalentAI will extract experience and skills in the background.
              </p>
              <ResumeUploadArea
                onUpload={(f) => { setResumeFile(f); invalidateKeyOnEdit() }}
                uploading={false}
                disabled={false}
              />
            </div>
          </div>
        )}

        {busy && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="animate-spin h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full" />
            <p className="text-sm font-medium text-foreground">{progressLabel}</p>
            <p className="text-xs text-muted-foreground">
              Resume reading starts automatically after the file is stored — no waiting needed.
            </p>
          </div>
        )}

        {phase === 'success' && result && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-4 rounded-lg border border-success/30 bg-success/5">
              <TickCircle className="h-6 w-6 text-success" />
              <div>
                <p className="text-sm font-medium text-foreground">Candidate added successfully</p>
                <p className="text-xs text-muted-foreground">
                  {result.applicationNumber} &middot; {result.jobTitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-background">
              <DocumentText className="h-5 w-5 text-muted" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Resume</p>
                <p className="text-xs text-muted-foreground truncate">{resumeFile?.name}</p>
              </div>
              <div className="shrink-0">
                {resumeStatus === 'checking' && <span className="text-xs text-muted-foreground animate-pulse">Checking...</span>}
                {resumeStatus === 'processing' && (
                  <span className="text-xs text-warning flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-warning animate-pulse" />
                    Processing...
                  </span>
                )}
                {resumeStatus === 'ready' && (
                  <span className="text-xs text-success flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-success" />
                    Ready
                  </span>
                )}
                {resumeStatus === 'failed' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-error">Processing failed</span>
                    <Button variant="outline" size="sm" onClick={handleRetryExtraction} disabled={extractionRetryPending}>
                      <Refresh className="h-3 w-3 mr-1" />
                      Retry
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {resumeStatus === 'ready' && (
              <div className="text-center pt-1">
                <Button onClick={handleStartScreening} size="lg">
                  Start AI Screening
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  AI will compare the candidate&apos;s resume against the job requirements
                </p>
              </div>
            )}
            {resumeStatus !== 'ready' && (
              <p className="text-xs text-muted-foreground text-center">
                The candidate is already in your list. Resume reading continues in the background — you can close this dialog now.
              </p>
            )}
          </div>
        )}

        {phase === 'screening-in-progress' && (
          <div className="py-4">
            <ScreeningProgress workflowState={screening.state.workflowState} />
          </div>
        )}

        {phase === 'screening-done' && (
          <div className="py-2 space-y-4">
            {screening.state.screeningResult && (
              <ScreeningResultView result={screening.state.screeningResult} />
            )}
            {screening.state.workflowState === 'SCREENING_FAILED' && (
              <div className="text-center">
                <p className="text-sm text-error mb-3">{screening.state.error || 'Screening failed'}</p>
                <Button onClick={handleRetryScreening} variant="outline">Retry Screening</Button>
              </div>
            )}
          </div>
        )}

        {phase === 'failed' && (
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg border border-error/30 bg-error/5">
              <Warning2 className="h-6 w-6 text-error" />
              <div>
                <p className="text-sm font-medium text-foreground">{error?.title ?? 'Step Failed'}</p>
                <p className="text-xs text-muted-foreground">{error?.detail}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Nothing was created unless this step fully completed — retrying is safe and will not create duplicates.
                </p>
              </div>
            </div>
            {error?.retryable && (
              <div className="flex flex-col items-center gap-2">
                <Button onClick={handleRetry} size="sm" disabled={retryPending || busy}>
                  {retryPending ? 'Retrying...' : 'Retry'}
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {phase === 'idle' && (
            <div className="flex items-center gap-2 w-full">
              <Button variant="outline" onClick={handleCancel}>Cancel</Button>
              <Button className="ml-auto" onClick={handleSubmit} disabled={!formValid || busy}>
                Add Candidate
              </Button>
            </div>
          )}
          {busy && <Button disabled>Processing...</Button>}
          {(phase === 'success' || phase === 'screening-done') && (
            <Button onClick={handleClose}>Done</Button>
          )}
          {phase === 'failed' && (
            <Button variant="outline" onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}