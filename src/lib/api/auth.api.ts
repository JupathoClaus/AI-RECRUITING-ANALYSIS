import { apiRequest, setTokens, clearTokens } from "./client"
import type {
  LoginRequest,
  LoginResponse,
  MeResponse,
  RegisterCompanyRequest,
  RegisterCompanyResponse,
} from "./types"

export async function login(dto: LoginRequest): Promise<LoginResponse> {
  const result = await apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: dto,
    skipAuth: true,
  })
  setTokens(result.tokens.accessToken, result.tokens.refreshToken)
  return result
}

export async function registerCompany(dto: RegisterCompanyRequest): Promise<RegisterCompanyResponse> {
  return apiRequest<RegisterCompanyResponse>("/auth/register-company", {
    method: "POST",
    body: dto,
    skipAuth: true,
  })
}

export async function getMe(): Promise<MeResponse> {
  return apiRequest<MeResponse>("/auth/me")
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<void>("/auth/logout", { method: "POST" })
  } finally {
    clearTokens()
  }
}

export async function verifyEmail(token: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>("/auth/verify-email", {
    method: "POST",
    body: { token },
    skipAuth: true,
  })
}

export async function resendVerification(email: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>("/auth/resend-verification", {
    method: "POST",
    body: { email },
    skipAuth: true,
  })
}
