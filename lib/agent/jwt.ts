import jwt from "jsonwebtoken"

export const RUNTIME_JWT_AUDIENCE = "instant-coding-runtime"
const ISSUER = "instant-coding-bff"
const TTL_SECONDS = 300

export interface RuntimeJwtClaims {
  sub: string
  aud: typeof RUNTIME_JWT_AUDIENCE
  iss: typeof ISSUER
  iat: number
  exp: number
}

/**
 * Sign a short-lived HS256 JWT that the Codespace agent-runtime can verify.
 * Secret lives in AGENT_RUNTIME_JWT_SECRET; BFF and runtime must share it
 * (see ARCHITECTURE §6.2 — provisioned at Codespace creation time).
 */
export function signRuntimeJwt(userId: string): string {
  const secret = process.env.AGENT_RUNTIME_JWT_SECRET
  if (!secret) {
    throw new Error("AGENT_RUNTIME_JWT_SECRET is not set")
  }
  return jwt.sign({ sub: userId }, secret, {
    algorithm: "HS256",
    audience: RUNTIME_JWT_AUDIENCE,
    issuer: ISSUER,
    expiresIn: TTL_SECONDS,
  })
}
