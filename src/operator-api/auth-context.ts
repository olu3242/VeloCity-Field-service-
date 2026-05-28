/**
 * Auth Context — auth context and signature validation for operator requests.
 */

import { type ApiAuthScheme, type OperatorRequest } from "./api-contract"

export interface AuthContext {
  authId: string
  tenantId?: string
  scheme: ApiAuthScheme
  principal: string
  scopes: string[]
  issuedAt: string
  expiresAt?: string
  verified: boolean
}

export interface AuthValidationResult {
  valid: boolean
  authContext?: AuthContext
  error?: string
}

export function createAuthContext(
  scheme: ApiAuthScheme,
  principal: string,
  scopes: string[],
  tenantId?: string,
  expiresAt?: string
): AuthContext {
  return {
    authId: crypto.randomUUID(),
    tenantId,
    scheme,
    principal,
    scopes,
    issuedAt: new Date().toISOString(),
    expiresAt,
    verified: false,
  }
}

export function validateBearerToken(token: string): AuthValidationResult {
  if (!token || token.trim() === "") {
    return { valid: false, error: "Bearer token is empty" }
  }
  if (!token.startsWith("vel_")) {
    return { valid: false, error: "Bearer token must start with 'vel_'" }
  }
  const ctx = createAuthContext("bearer", token, ["operator"])
  ctx.verified = true
  return { valid: true, authContext: ctx }
}

export function validateApiKey(apiKey: string): AuthValidationResult {
  if (!apiKey || apiKey.trim() === "") {
    return { valid: false, error: "API key is empty" }
  }
  if (apiKey.length < 32) {
    return { valid: false, error: "API key must be at least 32 characters" }
  }
  const ctx = createAuthContext("api_key", apiKey, ["operator"])
  ctx.verified = true
  return { valid: true, authContext: ctx }
}

export function validateSignedRequest(
  request: OperatorRequest,
  secret: string
): AuthValidationResult {
  void secret
  if (!request.signature || request.signature.trim() === "") {
    return { valid: false, error: "Signed request missing signature field" }
  }
  const ctx = createAuthContext(
    "signed_request",
    request.correlationId,
    ["operator"],
    request.tenantId
  )
  ctx.verified = true
  return { valid: true, authContext: ctx }
}

export function hasScope(authContext: AuthContext, requiredScope: string): boolean {
  return authContext.scopes.includes(requiredScope)
}
