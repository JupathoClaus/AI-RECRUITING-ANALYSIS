'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { ScreeningWorkflowState } from './screening-state'
import {
  POLLING_INTERVAL_MS, MAX_POLLING_DURATION_MS, EXTRACTION_RETRY_INTERVAL_MS, MAX_EXTRACTION_WAIT_MS,
  workflowStateForStatus, screeningResultStateUpdate, isRetryablePollingError, isExpectedNoScreeningError,
  isExtractionPendingError, isExtractionFailedError, classifyScreeningError,
} from './screening-helpers'
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

function newController() {
  const c = new AbortController()
  return { controller: c, signal: c.signal }
}

export function useAiScreening() {
  const [state, setState] = useState<ScreeningState>(initialState)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const extractionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollControllerRef = useRef<AbortController | null>(null)
  const extractionReqControllerRef = useRef<AbortController | null>(null)
  const uploadControllerRef = useRef<AbortController | null>(null)
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
    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null }
    if (extractionTimerRef.current) { clearTimeout(extractionTimerRef.current); extractionTimerRef.current = null }
    if (pollControllerRef.current) { pollControllerRef.current.abort(); pollControllerRef.current = null }
    if (extractionReqControllerRef.current) { extractionReqControllerRef.current.abort(); extractionReqControllerRef.current = null }
    if (uploadControllerRef.current) { uploadControllerRef.current.abort(); uploadControllerRef.current = null }
  }, [])

  const isStale = useCallback((appId: string | null) => {
    return !mountedRef.current || (appId !== null && applicationRef.current !== appId)
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

  const handleUploadResume = useCallback(async (file: File) => {
    const appId = applicationRef.current
    if (!appId) return
    const { controller, signal } = newController()
    uploadControllerRef.current = controller
    setWorkflow({ workflowState: 'UPLOADING_RESUME', uploadProgress: true, error: null, errorCode: null })
    try {
      const result = await uploadResume(appId, file, signal)
      if (isStale(appId)) return
      setWorkflow({ workflowState: 'RESUME_READY', uploadProgress: false, uploadedFile: result })
    } catch (err) {
      if (isStale(appId)) return
      const { isAbort } = classifyScreeningError(err instanceof ApiErrorResponse ? err : (err instanceof Error ? err : null))
      if (isAbort) {
        setWorkflow({ workflowState: 'RESUME_MISSING', uploadProgress: false })
        return
      }
      const apiErr = err instanceof ApiErrorResponse ? err : null
      setWorkflow({
        workflowState: 'ERROR',
        uploadProgress: false,
        error: apiErr?.message || 'Upload failed',
        errorCode: apiErr?.errorCode || 'UPLOAD_FAILED',
      })
    } finally {
      if (uploadControllerRef.current === controller) uploadControllerRef.current = null
    }
  }, [setWorkflow, isStale])

  const cancelUpload = useCallback(() => {
    if (uploadControllerRef.current) {
      uploadControllerRef.current.abort()
      uploadControllerRef.current = null
    }
    setWorkflow({ workflowState: 'RESUME_MISSING', uploadProgress: false })
  }, [setWorkflow])

  const pollScreening = useCallback((screeningId: string, startTime: number) => {
    if (!mountedRef.current) return
    const elapsed = Date.now() - startTime
    if (elapsed >= MAX_POLLING_DURATION_MS) {
      setWorkflow({ workflowState: 'TIMED_OUT', error: 'Screening is taking longer than expected. You can check again later.' })
      return
    }
    pollTimerRef.current = setTimeout(async () => {
      const currentAppId = applicationRef.current
      if (!mountedRef.current || !currentAppId) return
      const { controller, signal } = newController()
      pollControllerRef.current = controller
      try {
        const result = await getAiScreeningById(screeningId, signal)
        if (isStale(currentAppId)) return
        if (result.status === 'COMPLETED' || result.status === 'FAILED') {
          const update = screeningResultStateUpdate(result)
          setWorkflow(update)
        } else {
          setWorkflow({ workflowState: workflowStateForStatus(result.status), screeningResult: result })
          pollScreening(screeningId, startTime)
        }
      } catch (err) {
        if (isStale(currentAppId)) return
        const apiErr = err instanceof ApiErrorResponse ? err : (err instanceof Error ? err : null)
        if (classifyScreeningError(apiErr).isAbort) return
        if (isRetryablePollingError(apiErr as ApiErrorResponse | null)) {
          pollScreening(screeningId, startTime)
        } else {
          setWorkflow({
            workflowState: 'ERROR',
            error: apiErr instanceof ApiErrorResponse ? apiErr.message : 'Screening check failed',
            errorCode: apiErr instanceof ApiErrorResponse ? apiErr.errorCode : 'POLL_FAILED',
          })
        }
      } finally {
        if (pollControllerRef.current === controller) pollControllerRef.current = null
      }
    }, POLLING_INTERVAL_MS)
  }, [setWorkflow, isStale])

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
      const { controller, signal } = newController()
      extractionReqControllerRef.current = controller
      try {
        const response = await requestAiScreening(currentAppId, { signal })
        if (isStale(currentAppId)) return
        if (response.status === 202 || response.status === 200) {
          const { data } = response.data
          if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            const update = screeningResultStateUpdate(data)
            setWorkflow({ ...update, screeningId: data.id })
          } else {
            setWorkflow({
              workflowState: workflowStateForStatus(data.status),
              screeningResult: data,
              screeningId: data.id,
            })
            pollScreening(data.id, Date.now())
          }
        } else {
          waitForExtraction(startTime)
        }
      } catch (err) {
        if (isStale(currentAppId)) return
        const apiErr = err instanceof ApiErrorResponse ? err : null
        if (classifyScreeningError(apiErr).isAbort) return
        if (apiErr && isExtractionPendingError(apiErr)) {
          waitForExtraction(startTime)
        } else if (apiErr && isExtractionFailedError(apiErr)) {
          setWorkflow({ workflowState: 'EXTRACTION_FAILED', error: apiErr.message, errorCode: 'RESUME_EXTRACTION_FAILED' })
        } else {
          setWorkflow({
            workflowState: 'ERROR',
            error: apiErr?.message || 'Request failed',
            errorCode: apiErr?.errorCode || 'REQUEST_FAILED',
          })
        }
      } finally {
        if (extractionReqControllerRef.current === controller) extractionReqControllerRef.current = null
      }
    }, EXTRACTION_RETRY_INTERVAL_MS)
  }, [setWorkflow, pollScreening, isStale])

  const requestScreening = useCallback(async () => {
    const appId = applicationRef.current
    if (!appId) return
    cancelAll()
    setWorkflow({ workflowState: 'REQUESTING_SCREENING', error: null, errorCode: null })
    try {
      const response = await requestAiScreening(appId)
      if (isStale(appId)) return
      if (response.status === 202 || response.status === 200) {
        const { data } = response.data
        const update = screeningResultStateUpdate(data)
        setWorkflow({ ...update, screeningId: data.id })
        if (data.status !== 'COMPLETED' && data.status !== 'FAILED') {
          pollScreening(data.id, Date.now())
        }
      }
    } catch (err) {
      if (isStale(appId)) return
      const apiErr = err instanceof ApiErrorResponse ? err : null
      if (apiErr && isExtractionPendingError(apiErr)) {
        setWorkflow({ workflowState: 'WAITING_FOR_EXTRACTION', extractionStatus: 'PENDING' })
        waitForExtraction(Date.now())
      } else if (apiErr && isExtractionFailedError(apiErr)) {
        setWorkflow({ workflowState: 'EXTRACTION_FAILED', error: apiErr.message, errorCode: 'RESUME_EXTRACTION_FAILED' })
      } else {
        setWorkflow({
          workflowState: 'ERROR',
          error: apiErr?.message || 'Screening request failed',
          errorCode: apiErr?.errorCode || 'REQUEST_FAILED',
        })
      }
    }
  }, [cancelAll, setWorkflow, pollScreening, waitForExtraction, isStale])

  const retryScreening = useCallback(() => { requestScreening() }, [requestScreening])

  const loadLatestScreening = useCallback(async (applicationId: string) => {
    try {
      const result = await getLatestAiScreening(applicationId)
      if (isStale(applicationId)) return
      if (result.status === 'COMPLETED' || result.status === 'FAILED') {
        const update = screeningResultStateUpdate(result)
        setWorkflow({ ...update, screeningId: result.id })
      } else {
        setWorkflow({
          workflowState: workflowStateForStatus(result.status),
          screeningResult: result,
          screeningId: result.id,
        })
        pollScreening(result.id, Date.now())
      }
    } catch (err) {
      if (isStale(applicationId)) return
      const apiErr = err instanceof ApiErrorResponse ? err : null
      if (apiErr && isExpectedNoScreeningError(apiErr)) return
      setWorkflow({
        workflowState: 'ERROR',
        error: apiErr?.message || 'Failed to load screening',
        errorCode: apiErr?.errorCode || 'LOAD_FAILED',
      })
    }
  }, [setWorkflow, pollScreening, isStale])

  return {
    state,
    selectApplication,
    handleUploadResume,
    cancelUpload,
    requestScreening,
    retryScreening,
    loadLatestScreening,
  }
}
