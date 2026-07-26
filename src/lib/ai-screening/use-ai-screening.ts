'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { POLLING_INTERVAL_MS, MAX_POLLING_DURATION_MS, EXTRACTION_RETRY_INTERVAL_MS, MAX_EXTRACTION_WAIT_MS } from './screening-state'
import type { ScreeningWorkflowState } from './screening-state'
import { AiScreeningResultDto, requestAiScreening, getLatestAiScreening, getAiScreeningById } from '@/lib/api/ai-screening.api'
import { uploadResume, StoredFileResponse } from '@/lib/api/files.api'
import { ApiErrorResponse } from '@/lib/api/client'

export interface ScreeningState {
  workflowState: ScreeningWorkflowState
  selectedApplicationId: string | null
  screeningResult: AiScreeningResultDto | null
  screeningId: string | null
  extractionStatus: string | null
  error: string | null
  errorCode: string | null
  uploadProgress: boolean
  uploadedFile: StoredFileResponse | null
}

const initialState: ScreeningState = {
  workflowState: 'IDLE',
  selectedApplicationId: null,
  screeningResult: null,
  screeningId: null,
  extractionStatus: null,
  error: null,
  errorCode: null,
  uploadProgress: false,
  uploadedFile: null,
}

export function useAiScreening() {
  const [state, setState] = useState<ScreeningState>(initialState)
  const abortRef = useRef<AbortController | null>(null)
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const extractionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const applicationRef = useRef<string | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cancelAll()
    }
  }, [])

  const cancelAll = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null }
    if (pollingTimerRef.current) { clearTimeout(pollingTimerRef.current); pollingTimerRef.current = null }
    if (extractionTimerRef.current) { clearTimeout(extractionTimerRef.current); extractionTimerRef.current = null }
  }, [])

  const setWorkflow = useCallback((updates: Partial<ScreeningState>) => {
    if (mountedRef.current) setState(prev => ({ ...prev, ...updates }))
  }, [])

  const selectApplication = useCallback((applicationId: string) => {
    cancelAll()
    applicationRef.current = applicationId
    setWorkflow({
      selectedApplicationId: applicationId,
      workflowState: 'APPLICATION_SELECTED',
      screeningResult: null,
      screeningId: null,
      extractionStatus: null,
      error: null,
      errorCode: null,
      uploadedFile: null,
    })
  }, [cancelAll, setWorkflow])

  const setResumeAvailable = useCallback(() => {
    setWorkflow({ workflowState: 'RESUME_READY' })
  }, [setWorkflow])

  const setResumeMissing = useCallback(() => {
    setWorkflow({ workflowState: 'RESUME_MISSING' })
  }, [setWorkflow])

  const handleUploadResume = useCallback(async (file: File) => {
    const appId = applicationRef.current
    if (!appId) return
    setWorkflow({ workflowState: 'UPLOADING_RESUME', uploadProgress: true, error: null, errorCode: null })
    try {
      const result = await uploadResume(appId, file)
      if (!mountedRef.current || applicationRef.current !== appId) return
      setWorkflow({ workflowState: 'RESUME_READY', uploadProgress: false, uploadedFile: result })
    } catch (err) {
      if (!mountedRef.current || applicationRef.current !== appId) return
      const apiErr = err instanceof ApiErrorResponse ? err : null
      setWorkflow({
        workflowState: 'ERROR',
        uploadProgress: false,
        error: apiErr?.message || 'Upload failed',
        errorCode: apiErr?.errorCode || 'UPLOAD_FAILED',
      })
    }
  }, [setWorkflow])

  const pollScreening = useCallback((screeningId: string, startTime: number) => {
    if (!mountedRef.current) return
    const elapsed = Date.now() - startTime
    if (elapsed >= MAX_POLLING_DURATION_MS) {
      setWorkflow({ workflowState: 'TIMED_OUT', error: 'Screening is taking longer than expected. You can check again later.' })
      return
    }
    pollingTimerRef.current = setTimeout(async () => {
      const currentAppId = applicationRef.current
      if (!mountedRef.current || !currentAppId) return
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const result = await getAiScreeningById(screeningId, controller.signal)
        if (!mountedRef.current || applicationRef.current !== currentAppId) return
        if (result.status === 'COMPLETED') {
          setWorkflow({ workflowState: 'SCREENING_COMPLETED', screeningResult: result })
        } else if (result.status === 'FAILED') {
          setWorkflow({
            workflowState: 'SCREENING_FAILED',
            screeningResult: result,
            error: result.failureMessageSafe || 'Screening failed',
            errorCode: result.failureCode || 'SCREENING_FAILED',
          })
        } else {
          const ws = result.status === 'PENDING' ? 'SCREENING_PENDING' : 'SCREENING_RUNNING'
          setWorkflow({ workflowState: ws, screeningResult: result })
          pollScreening(screeningId, startTime)
        }
      } catch (err) {
        if (!mountedRef.current || applicationRef.current !== currentAppId) return
        const apiErr = err instanceof ApiErrorResponse ? err : null
        const isRetryable = apiErr ? (apiErr.statusCode === 429 || apiErr.statusCode >= 500 || !apiErr.statusCode) : true
        if (isRetryable) {
          pollScreening(screeningId, startTime)
        } else {
          setWorkflow({
            workflowState: 'ERROR',
            error: apiErr?.message || 'Screening check failed',
            errorCode: apiErr?.errorCode || 'POLL_FAILED',
          })
        }
      }
    }, POLLING_INTERVAL_MS)
  }, [setWorkflow])

  const waitForExtraction = useCallback((startTime: number) => {
    if (!mountedRef.current) return
    const elapsed = Date.now() - startTime
    if (elapsed >= MAX_EXTRACTION_WAIT_MS) {
      setWorkflow({ workflowState: 'TIMED_OUT', error: 'Resume processing timed out. Please try again.', errorCode: 'EXTRACTION_TIMEOUT' })
      return
    }
    extractionTimerRef.current = setTimeout(async () => {
      const currentAppId = applicationRef.current
      if (!mountedRef.current || !currentAppId) return
      try {
        const response = await requestAiScreening(currentAppId, { signal: abortRef.current?.signal })
        if (!mountedRef.current || applicationRef.current !== currentAppId) return
        if (response.status === 202 || response.status === 200) {
          const { action, data } = response.data
          if (data.status === 'COMPLETED') {
            setWorkflow({ workflowState: 'SCREENING_COMPLETED', screeningResult: data, screeningId: data.id })
          } else if (data.status === 'FAILED') {
            setWorkflow({
              workflowState: 'SCREENING_FAILED',
              screeningResult: data,
              error: data.failureMessageSafe || 'Screening failed',
              errorCode: data.failureCode || 'SCREENING_FAILED',
            })
          } else {
            setWorkflow({
              workflowState: data.status === 'PENDING' ? 'SCREENING_PENDING' : 'SCREENING_RUNNING',
              screeningResult: data,
              screeningId: data.id,
            })
            pollScreening(data.id, Date.now())
          }
        } else {
          waitForExtraction(startTime)
        }
      } catch (err) {
        if (!mountedRef.current || applicationRef.current !== currentAppId) return
        const apiErr = err instanceof ApiErrorResponse ? err : null
        if (apiErr?.errorCode === 'RESUME_EXTRACTION_PENDING') {
          waitForExtraction(startTime)
        } else if (apiErr?.errorCode === 'RESUME_EXTRACTION_FAILED') {
          setWorkflow({ workflowState: 'EXTRACTION_FAILED', error: apiErr.message, errorCode: 'RESUME_EXTRACTION_FAILED' })
        } else {
          setWorkflow({ workflowState: 'ERROR', error: apiErr?.message || 'Request failed', errorCode: apiErr?.errorCode || 'REQUEST_FAILED' })
        }
      }
    }, EXTRACTION_RETRY_INTERVAL_MS)
  }, [setWorkflow, pollScreening])

  const requestScreening = useCallback(async () => {
    const appId = applicationRef.current
    if (!appId) return
    cancelAll()
    setWorkflow({ workflowState: 'REQUESTING_SCREENING', error: null, errorCode: null })
    try {
      const response = await requestAiScreening(appId)
      if (!mountedRef.current || applicationRef.current !== appId) return

      if (response.status === 202) {
        const { data } = response.data
        if (data.status === 'COMPLETED') {
          setWorkflow({ workflowState: 'SCREENING_COMPLETED', screeningResult: data, screeningId: data.id })
        } else {
          setWorkflow({
            workflowState: data.status === 'PENDING' ? 'SCREENING_PENDING' : 'SCREENING_RUNNING',
            screeningResult: data,
            screeningId: data.id,
          })
          pollScreening(data.id, Date.now())
        }
      } else if (response.status === 200) {
        const { data } = response.data
        if (data.status === 'COMPLETED') {
          setWorkflow({ workflowState: 'SCREENING_COMPLETED', screeningResult: data, screeningId: data.id })
        } else if (data.status === 'FAILED') {
          setWorkflow({
            workflowState: 'SCREENING_FAILED',
            screeningResult: data,
            error: data.failureMessageSafe || 'Screening failed',
            errorCode: data.failureCode || 'SCREENING_FAILED',
          })
        } else {
          setWorkflow({
            workflowState: data.status === 'PENDING' ? 'SCREENING_PENDING' : 'SCREENING_RUNNING',
            screeningResult: data,
            screeningId: data.id,
          })
          pollScreening(data.id, Date.now())
        }
      }
    } catch (err) {
      if (!mountedRef.current || applicationRef.current !== appId) return
      const apiErr = err instanceof ApiErrorResponse ? err : null
      if (apiErr?.errorCode === 'RESUME_EXTRACTION_PENDING') {
        setWorkflow({ workflowState: 'WAITING_FOR_EXTRACTION', extractionStatus: 'PENDING' })
        waitForExtraction(Date.now())
      } else if (apiErr?.errorCode === 'RESUME_EXTRACTION_FAILED') {
        setWorkflow({ workflowState: 'EXTRACTION_FAILED', error: apiErr.message, errorCode: 'RESUME_EXTRACTION_FAILED' })
      } else {
        setWorkflow({
          workflowState: 'ERROR',
          error: apiErr?.message || 'Screening request failed',
          errorCode: apiErr?.errorCode || 'REQUEST_FAILED',
        })
      }
    }
  }, [cancelAll, setWorkflow, pollScreening, waitForExtraction])

  const retryScreening = useCallback(() => {
    requestScreening()
  }, [requestScreening])

  const loadLatestScreening = useCallback(async (applicationId: string) => {
    try {
      const result = await getLatestAiScreening(applicationId)
      if (!mountedRef.current || applicationRef.current !== applicationId) return
      if (result.status === 'COMPLETED') {
        setWorkflow({ workflowState: 'SCREENING_COMPLETED', screeningResult: result, screeningId: result.id })
      } else if (result.status === 'FAILED') {
        setWorkflow({
          workflowState: 'SCREENING_FAILED',
          screeningResult: result,
          error: result.failureMessageSafe || 'Screening failed',
          errorCode: result.failureCode || 'SCREENING_FAILED',
        })
      } else if (result.status === 'PENDING' || result.status === 'RUNNING') {
        setWorkflow({
          workflowState: result.status === 'PENDING' ? 'SCREENING_PENDING' : 'SCREENING_RUNNING',
          screeningResult: result,
          screeningId: result.id,
        })
        pollScreening(result.id, Date.now())
      }
    } catch (err) {
      if (!mountedRef.current || applicationRef.current !== applicationId) return
      const apiErr = err instanceof ApiErrorResponse ? err : null
      if (apiErr?.statusCode !== 404) {
        setWorkflow({
          workflowState: 'ERROR',
          error: apiErr?.message || 'Failed to load screening',
          errorCode: apiErr?.errorCode || 'LOAD_FAILED',
        })
      }
    }
  }, [setWorkflow, pollScreening])

  const reset = useCallback(() => {
    cancelAll()
    applicationRef.current = null
    setState(initialState)
  }, [cancelAll])

  return {
    state,
    selectApplication,
    setResumeAvailable,
    setResumeMissing,
    handleUploadResume,
    requestScreening,
    retryScreening,
    loadLatestScreening,
    reset,
  }
}
