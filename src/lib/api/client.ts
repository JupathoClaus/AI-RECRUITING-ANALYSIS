const TOKEN_KEY = "ai-recruiter-access-token"
const REFRESH_KEY = "ai-recruiter-refresh-token"
const REQUEST_TIMEOUT_MS = 15000

function getBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL
  if (envUrl) return envUrl
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:3000/api/v1`
  }
  return "http://localhost:3000/api/v1"
}

let refreshPromise: Promise<string | null> | null = null

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(REFRESH_KEY)
}

export function isAuthenticated(): boolean {
  return !!getAccessToken()
}

interface RequestOptions {
  method?: string
  body?: unknown
  params?: Record<string, string | number | string[] | undefined>
  skipAuth?: boolean
}

export class ApiErrorResponse extends Error {
  statusCode: number
  errorCode: string
  errors: string[]
  constructor(statusCode: number, errorCode: string, message: string, errors: string[] = []) {
    super(message)
    this.name = "ApiErrorResponse"
    this.statusCode = statusCode
    this.errorCode = errorCode
    this.errors = errors
  }
}

async function doFetch(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const refreshToken = getStoredRefreshToken()
    if (!refreshToken) return null

    try {
      const res = await doFetch(
        `${getBaseUrl()}/auth/refresh`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
          credentials: "include",
        },
        REQUEST_TIMEOUT_MS,
      )

      if (!res.ok) {
        clearTokens()
        return null
      }

      const json = await res.json()
      const data = (json as { data?: { accessToken: string; refreshToken: string } }).data || json
      setTokens(data.accessToken, data.refreshToken)
      return data.accessToken
    } catch {
      clearTokens()
      return null
    }
  })()

  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, params, skipAuth = false } = options

  let url = `${getBaseUrl()}${path}`
  if (params) {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          for (const v of value) {
            searchParams.append(`${key}[]`, String(v))
          }
        } else {
          searchParams.set(key, String(value))
        }
      }
    }
    const qs = searchParams.toString()
    if (qs) url += `?${qs}`
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  }

  if (!skipAuth) {
    const token = getAccessToken()
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }
  }

  let res = await doFetch(
    url,
    {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    },
    REQUEST_TIMEOUT_MS,
  )

  if (res.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`
      res = await doFetch(
        url,
        {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          credentials: "include",
        },
        REQUEST_TIMEOUT_MS,
      )
    }
  }

  if (!res.ok) {
    let errorBody: { errorCode?: string; message?: string } | null = null
    try {
      errorBody = (await res.json()) as { errorCode?: string; message?: string }
    } catch {
      // ignore parse errors
    }
    throw new ApiErrorResponse(
      res.status,
      errorBody?.errorCode || "REQUEST_FAILED",
      errorBody?.message || `Request failed with status ${res.status}`,
      (errorBody as { errors?: string[] })?.errors || [],
    )
  }

  if (res.status === 204) {
    return undefined as T
  }

  const json = await res.json()
  const apiRes = json as { data?: unknown; meta?: unknown; statusCode?: number }

  if (apiRes.data !== undefined && apiRes.meta !== undefined) {
    return { data: apiRes.data, meta: apiRes.meta } as T
  }
  return (apiRes.data !== undefined ? apiRes.data : json) as T
}
