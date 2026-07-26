'use client'

import React, { useEffect, useRef } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ApplicationSelector } from '@/components/ai-screening/application-selector'
import { ResumeUploadArea } from '@/components/ai-screening/resume-upload-area'
import { ScreeningProgress } from '@/components/ai-screening/screening-progress'
import { ScreeningResultView } from '@/components/ai-screening/screening-result-view'
import { useAiScreening } from '@/lib/ai-screening/use-ai-screening'
import { getApplicationResume } from '@/lib/api/files.api'
import { Shield, RefreshCw } from 'lucide-react'

export default function AiScreenerPage() {
  const {
    state,
    selectApplication,
    handleUploadResume,
    cancelUpload,
    requestScreening,
    retryScreening,
    loadLatestScreening,
  } = useAiScreening()

  const checkingRef = useRef(false)
  const checkControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const appId = state.selectedApplicationId
    if (!appId) return
    if (checkingRef.current) return
    checkingRef.current = true
    const controller = new AbortController()
    checkControllerRef.current = controller
    getApplicationResume(appId)
      .then((file) => {
        if (controller.signal.aborted) return
        if (file) {
          loadLatestScreening(appId)
        }
      })
      .catch(() => {})
      .finally(() => {
        checkingRef.current = false
        if (checkControllerRef.current === controller) checkControllerRef.current = null
      })
    return () => { controller.abort() }
  }, [state.selectedApplicationId, loadLatestScreening])

  const handleSelect = (applicationId: string) => {
    selectApplication(applicationId)
  }

  const isProcessing = ['REQUESTING_SCREENING', 'WAITING_FOR_EXTRACTION', 'SCREENING_PENDING', 'SCREENING_RUNNING', 'UPLOADING_RESUME'].includes(state.workflowState)

  return (
    <AppLayout title="AI Resume Screener" description="Screen candidate applications using AI">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Application selection */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Select Application</CardTitle>
            </CardHeader>
            <CardContent>
              <ApplicationSelector onSelect={handleSelect} selectedId={state.selectedApplicationId} />
            </CardContent>
          </Card>

          {state.selectedApplicationId && ['RESUME_MISSING', 'UPLOADING_RESUME', 'ERROR'].includes(state.workflowState) && state.workflowState !== 'SCREENING_COMPLETED' && state.workflowState !== 'SCREENING_FAILED' && (
            <ResumeUploadArea
              onUpload={handleUploadResume}
              uploading={state.workflowState === 'UPLOADING_RESUME'}
              disabled={isProcessing}
            />
          )}
        </div>

        {/* Right column - Screening area */}
        <div className="lg:col-span-2 space-y-4">
          {state.workflowState === 'IDLE' || state.workflowState === 'LOADING_APPLICATIONS' ? (
            <EmptyState
              icon={<Shield className="h-12 w-12" />}
              title="Select an application to start"
              description="Choose a candidate application from the list to run an AI screening."
            />
          ) : state.workflowState === 'APPLICATION_SELECTED' || state.workflowState === 'RESUME_MISSING' ? (
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <p className="text-muted-foreground">
                  {state.workflowState === 'RESUME_MISSING'
                    ? 'Upload a resume for this application to enable AI screening.'
                    : 'Application selected. Upload a resume if needed, then request screening.'}
                </p>
                {state.workflowState !== 'RESUME_MISSING' && (
                  <Button onClick={requestScreening} disabled={isProcessing} size="lg">
                    Run AI Screening
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : state.workflowState === 'RESUME_READY' ? (
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <Badge variant="success" className="text-sm px-3 py-1">Resume available</Badge>
                <p className="text-muted-foreground">Ready to screen this application.</p>
                <Button onClick={requestScreening} disabled={isProcessing} size="lg">
                  Run AI Screening
                </Button>
              </CardContent>
            </Card>
          ) : state.workflowState === 'WAITING_FOR_EXTRACTION' ? (
            <Card>
              <CardContent className="p-6">
                <ScreeningProgress workflowState={state.workflowState} />
                <p className="text-sm text-muted-foreground mt-3">
                  TalentAI is securely reading the resume. Screening will start automatically when the resume is ready.
                </p>
              </CardContent>
            </Card>
          ) : state.workflowState === 'REQUESTING_SCREENING' || state.workflowState === 'SCREENING_PENDING' || state.workflowState === 'SCREENING_RUNNING' ? (
            <ScreeningProgress workflowState={state.workflowState} />
          ) : state.workflowState === 'SCREENING_COMPLETED' && state.screeningResult ? (
            <div className="space-y-4">
              <ScreeningResultView result={state.screeningResult} />
              <div className="flex justify-center">
                <Button variant="outline" onClick={retryScreening} disabled={isProcessing}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Run Again
                </Button>
              </div>
            </div>
          ) : state.workflowState === 'SCREENING_FAILED' || state.workflowState === 'EXTRACTION_FAILED' ? (
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <p className="text-destructive font-medium">
                  {state.workflowState === 'EXTRACTION_FAILED'
                    ? 'TalentAI could not read the uploaded resume.'
                    : 'Screening could not be completed.'}
                </p>
                <p className="text-sm text-muted-foreground">
                  The candidate was not rejected. No AI recommendation was produced.
                </p>
                {state.error && <p className="text-sm text-muted-foreground">Details: {state.error}</p>}
                <Button onClick={retryScreening} disabled={isProcessing}>
                  Try Again
                </Button>
              </CardContent>
            </Card>
          ) : state.workflowState === 'TIMED_OUT' ? (
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <p className="font-medium">Processing is taking longer than expected.</p>
                <p className="text-sm text-muted-foreground">{state.error}</p>
                <Button onClick={retryScreening}>
                  Check Status
                </Button>
              </CardContent>
            </Card>
          ) : state.workflowState === 'ERROR' ? (
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <p className="text-destructive font-medium">An error occurred</p>
                <p className="text-sm text-muted-foreground">{state.error}</p>
                <Button onClick={retryScreening}>Try Again</Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </AppLayout>
  )
}
