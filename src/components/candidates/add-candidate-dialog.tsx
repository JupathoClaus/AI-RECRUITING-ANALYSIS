'use client'

import * as React from 'react'
import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { ModalHeader } from '@/components/ui/modal-header'
import { ResumeUploadArea } from '@/components/ai-screening/resume-upload-area'
import { ScreeningProgress } from '@/components/ai-screening/screening-progress'
import { ScreeningResultView } from '@/components/ai-screening/screening-result-view'
import { TickCircle, DocumentText, Warning2 } from 'iconsax-react'
import { useAiScreening } from '@/lib/ai-screening/use-ai-screening'
import { createCandidate } from '@/lib/api/candidates.api'
import { createApplication } from '@/lib/api/applications.api'
import { useStore } from '@/store/useStore'
import type { Job } from '@/types'

type FlowPhase =
  | 'idle'
  | 'creating-candidate'
  | 'creating-application'
  | 'uploading-resume'
  | 'resume-uploaded'
  | 'waiting-extraction'
  | 'ready-for-screening'
  | 'screening-in-progress'
  | 'screening-done'
  | 'failed'

type FailTarget = 'candidate' | 'application' | 'upload' | 'extraction' | 'screening' | null

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobs: Job[]
  onComplete: () => void
}

export function AddCandidateDialog({ open, onOpenChange, jobs, onComplete }: Props) {
  const fetchCandidates = useStore((s) => s.fetchCandidates)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [experience, setExperience] = useState('')
  const [selectedJobId, setSelectedJobId] = useState('')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<FlowPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [candidateId, setCandidateId] = useState<string | null>(null)
  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [failTarget, setFailTarget] = useState<FailTarget>(null)

  const screening = useAiScreening()
  const submitLock = useRef(false)
  const screenLock = useRef(false)
  const stepRef = useRef({ candidate: false, application: false })

  const job = jobs.find((j) => j.id === selectedJobId)

  const fullReset = useCallback(() => {
    setName('')
    setEmail('')
    setPhone('')
    setExperience('')
    setSelectedJobId('')
    setResumeFile(null)
    setPhase('idle')
    setError(null)
    setCandidateId(null)
    setApplicationId(null)
    setFailTarget(null)
    submitLock.current = false
    screenLock.current = false
    stepRef.current = { candidate: false, application: false }
    screening.selectApplication('')
  }, [screening])

  React.useEffect(() => {
    if (!open) fullReset()
  }, [open, fullReset])

  React.useEffect(() => {
    if (phase !== 'waiting-extraction') return
    const ws = screening.state.workflowState
    if (ws === 'RESUME_READY') {
      setPhase('ready-for-screening')
    } else if (ws === 'EXTRACTION_FAILED') {
      setPhase('failed')
      setFailTarget('extraction')
      setError(screening.state.error || 'Resume extraction failed. Replace the file and try again.')
    } else if (ws === 'ERROR' || ws === 'TIMED_OUT') {
      setPhase('failed')
      setFailTarget('extraction')
      setError(screening.state.error || 'Resume extraction timed out.')
    }
  }, [phase, screening.state.workflowState, screening.state.error])

  React.useEffect(() => {
    if (phase !== 'screening-in-progress') return
    const ws = screening.state.workflowState
    if (ws === 'SCREENING_COMPLETED') {
      setPhase('screening-done')
    } else if (ws === 'SCREENING_FAILED') {
      setPhase('screening-done')
      setFailTarget('screening')
      setError(screening.state.error || 'AI Screening failed.')
    }
  }, [phase, screening.state.workflowState, screening.state.error])

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim() || !selectedJobId || !resumeFile || submitLock.current) return
    submitLock.current = true
    setError(null)
    setFailTarget(null)

    try {
      setPhase('creating-candidate')
      const parts = name.trim().split(/\s+/)
      const cand = await createCandidate({
        firstName: parts[0],
        lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
        email: email.trim(),
        phone: phone || undefined,
        source: 'RECRUITER_CREATED',
        currentJobTitle: job?.title,
        totalExperienceYears: experience ? Number(experience) : undefined,
      })
      setCandidateId(cand.id)
      stepRef.current.candidate = true

      setPhase('creating-application')
      const app = await createApplication({
        candidateId: cand.id,
        jobId: selectedJobId,
        source: 'RECRUITER_CREATED',
      })
      setApplicationId(app.id)
      stepRef.current.application = true
      screening.selectApplication(app.id)

      setPhase('uploading-resume')
      await screening.handleUploadResume(resumeFile)

      setPhase('resume-uploaded')
      setPhase('waiting-extraction')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Operation failed'
      if (!stepRef.current.candidate) setFailTarget('candidate')
      else if (!stepRef.current.application) setFailTarget('application')
      else setFailTarget('upload')
      setError(msg)
      setPhase('failed')
      submitLock.current = false
    }
  }

  const rebuildCandidateApp = async () => {
    const parts = name.trim().split(/\s+/)
    const cand = await createCandidate({
      firstName: parts[0],
      lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
      email: email.trim(),
      phone: phone || undefined,
      source: 'RECRUITER_CREATED',
      currentJobTitle: job?.title,
      totalExperienceYears: experience ? Number(experience) : undefined,
    })
    setCandidateId(cand.id)
    const app = await createApplication({
      candidateId: cand.id,
      jobId: selectedJobId,
      source: 'RECRUITER_CREATED',
    })
    setApplicationId(app.id)
    screening.selectApplication(app.id)
    await screening.handleUploadResume(resumeFile!)
  }

  const buildAppOnly = async () => {
    const app = await createApplication({
      candidateId: candidateId!,
      jobId: selectedJobId,
      source: 'RECRUITER_CREATED',
    })
    setApplicationId(app.id)
    screening.selectApplication(app.id)
    await screening.handleUploadResume(resumeFile!)
  }

  const uploadOnly = async () => {
    await screening.handleUploadResume(resumeFile!)
  }

  const tryStartScreening = async () => {
    screening.selectApplication(applicationId!)
    await screening.requestScreening()
  }

  const handleRetry = async () => {
    if (!name.trim() || !email.trim() || !selectedJobId || !resumeFile) {
      setError('All required fields must be filled.')
      return
    }
    setError(null)
    setFailTarget(null)
    submitLock.current = true

    try {
      if (failTarget === 'candidate') {
        await rebuildCandidateApp()
      } else if (failTarget === 'application') {
        await buildAppOnly()
      } else {
        await uploadOnly()
      }
      setPhase('resume-uploaded')
      setPhase('waiting-extraction')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Retry failed'
      setError(msg)
      submitLock.current = false
    }
  }

  const handleReplaceResume = async (file: File) => {
    setResumeFile(file)
    setPhase('uploading-resume')
    try {
      await screening.handleUploadResume(file)
      setPhase('resume-uploaded')
      setPhase('waiting-extraction')
    } catch {
      setError('Failed to upload resume. Please try again.')
      setPhase('failed')
      setFailTarget('extraction')
    }
  }

  const handleStartScreening = async () => {
    if (screenLock.current) return
    screenLock.current = true
    setPhase('screening-in-progress')
    try {
      await screening.requestScreening()
    } catch {
      if (screening.state.workflowState === 'SCREENING_COMPLETED' || screening.state.workflowState === 'SCREENING_FAILED') {
        setPhase('screening-done')
      } else {
        setPhase('failed')
        setFailTarget('screening')
        setError('Failed to start AI screening.')
        screenLock.current = false
      }
    }
  }

  const handleRetryScreening = () => {
    screenLock.current = false
    setPhase('screening-in-progress')
    setFailTarget(null)
    screening.retryScreening()
  }

  const handleClose = () => {
    if (candidateId && failTarget) {
      if (!window.confirm(
        'The candidate was created but the full workflow did not complete.\n' +
        'You can upload a resume and run AI screening from the candidate detail dialog.\n\nClose anyway?'
      )) return
    }
    fetchCandidates()
    onComplete()
    onOpenChange(false)
  }

  const handleCancel = () => {
    if (submitLock.current || screenLock.current) return
    onOpenChange(false)
  }

  const formValid = !!(name.trim() && email.trim() && selectedJobId && resumeFile)
  const busy = phase === 'creating-candidate' || phase === 'creating-application' || phase === 'uploading-resume'
  const showDone = phase === 'screening-done' || phase === 'ready-for-screening' || phase === 'waiting-extraction'

  const pickRetryAction = () => {
    switch (failTarget) {
      case 'candidate':
        return (
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs text-muted-foreground text-center">
              Candidate and application will be recreated.
            </p>
            <Button onClick={handleRetry} size="sm">Retry from Candidate Creation</Button>
          </div>
        )
      case 'application':
        return (
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs text-muted-foreground text-center">
              Candidate was created. Only the application will be retried.
            </p>
            <Button onClick={handleRetry} size="sm">Retry Application Creation</Button>
          </div>
        )
      case 'upload':
        return (
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs text-muted-foreground text-center">
              Candidate and application were created. Only the resume upload will be retried.
            </p>
            <Button onClick={handleRetry} size="sm">Retry Resume Upload</Button>
          </div>
        )
      case 'extraction':
        return (
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs text-muted-foreground text-center">
              Resume extraction failed. No dedicated retry-extraction API is available.
              Select a different file to replace the current resume.
            </p>
            <ResumeUploadArea
              onUpload={handleReplaceResume}
              uploading={screening.state.uploadProgress}
            />
          </div>
        )
      case 'screening':
        return (
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs text-muted-foreground text-center">
              Screening did not complete successfully.
            </p>
            <Button onClick={handleRetryScreening} size="sm">Retry AI Screening</Button>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <ModalHeader>
          <DialogTitle>Add New Candidate</DialogTitle>
          <DialogDescription>
            Add a candidate, apply to a job, upload their resume, and optionally run AI screening.
          </DialogDescription>
        </ModalHeader>

        {error && (
          <div className="rounded-lg border border-error/30 bg-error/5 text-error-foreground px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {phase === 'idle' && (
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Full Name *</label>
                <Input placeholder="e.g. John Smith" value={name}
                  onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Email *</label>
                <Input type="email" placeholder="john@example.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Phone</label>
                <Input type="tel" placeholder="+1 555-0100" value={phone}
                  onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Years of Experience</label>
                <Input type="number" placeholder="5" min={0} value={experience}
                  onChange={(e) => setExperience(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Applying For <span className="text-error">*</span>
              </label>
              <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a position" />
                </SelectTrigger>
                <SelectContent>
                  {jobs.filter((j) => j.status === 'Active').map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.title}{j.department ? ` — ${j.department}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Candidate Resume / CV <span className="text-error">*</span>
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Select the candidate&apos;s resume. TalentAI will extract experience and skills.
              </p>
              <ResumeUploadArea
                onUpload={(f) => setResumeFile(f)}
                uploading={false}
                disabled={false}
              />
            </div>
          </div>
        )}

        {busy && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="animate-spin h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full" />
            <p className="text-sm font-medium text-foreground">
              {phase === 'creating-candidate' && 'Creating candidate...'}
              {phase === 'creating-application' && 'Creating application...'}
              {phase === 'uploading-resume' && 'Uploading resume...'}
            </p>
          </div>
        )}

        {phase === 'resume-uploaded' && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="animate-spin h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full" />
            <p className="text-sm font-medium text-foreground">Preparing extraction...</p>
          </div>
        )}

        {phase === 'waiting-extraction' && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-4 rounded-lg border border-success/30 bg-success/5">
              <TickCircle className="h-6 w-6 text-success" />
              <div>
                <p className="text-sm font-medium text-foreground">Resume uploaded successfully</p>
                <p className="text-xs text-muted-foreground">{resumeFile?.name}</p>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center py-4 gap-2">
              <div className="animate-pulse flex items-center gap-2 text-sm text-muted-foreground">
                <DocumentText className="h-4 w-4" />
                Extracting resume content...
              </div>
              <ScreeningProgress workflowState="WAITING_FOR_EXTRACTION" />
            </div>
          </div>
        )}

        {phase === 'ready-for-screening' && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-4 rounded-lg border border-success/30 bg-success/5">
              <TickCircle className="h-6 w-6 text-success" />
              <div>
                <p className="text-sm font-medium text-foreground">Ready for AI Screening</p>
                <p className="text-xs text-muted-foreground">
                  {resumeFile?.name} &mdash; Resume extracted successfully
                </p>
              </div>
            </div>
            <div className="text-center pt-2">
              <Button onClick={handleStartScreening} size="lg">
                Start AI Screening
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                AI will compare the candidate&apos;s resume against the job requirements
              </p>
            </div>
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
                <p className="text-sm font-medium text-foreground">Step Failed</p>
                <p className="text-xs text-muted-foreground">
                  {failTarget === 'candidate' && 'Candidate could not be created.'}
                  {failTarget === 'application' && 'Application could not be created.'}
                  {failTarget === 'upload' && 'Resume could not be uploaded.'}
                  {failTarget === 'extraction' && 'Resume extraction did not complete.'}
                  {failTarget === 'screening' && 'AI Screening did not complete.'}
                </p>
              </div>
            </div>
            {pickRetryAction()}
            {candidateId && (
              <p className="text-xs text-muted-foreground text-center">
                The candidate record exists. You can access it from the candidates table.
              </p>
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
          {showDone && <Button onClick={handleClose}>Done</Button>}
          {phase === 'failed' && !['extraction', 'screening'].includes(failTarget ?? '') && (
            <Button variant="outline" onClick={handleClose}>
              {candidateId ? 'Close (Candidate Created)' : 'Close'}
            </Button>
          )}
          {phase === 'failed' && (failTarget === 'extraction' || failTarget === 'screening') && (
            <Button variant="outline" onClick={handleClose}>
              Close and Continue Later
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
