import jwt from "jsonwebtoken";

const JWT_AUD = "instant-coding-runtime";

export function authEnabled() {
  return Boolean(process.env.AGENT_RUNTIME_JWT_SECRET);
}

export function verifyBearer(token) {
  const secret = process.env.AGENT_RUNTIME_JWT_SECRET;
  if (!secret) throw new Error("AGENT_RUNTIME_JWT_SECRET not set");
  return jwt.verify(token, secret, { audience: JWT_AUD });
}

export function expressAuthMiddleware(req, res, next) {
  if (!authEnabled()) return next();
  const header = req.headers.authorization || "";
  const m = header.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: "auth_failed", message: "missing bearer" });
  try {
    req.jwt = verifyBearer(m[1]);
    next();
  } catch (err) {
    res.status(401).json({ error: "auth_failed", message: err.message });
  }
}

export function verifyWsUpgrade(req) {
  if (!authEnabled()) return { ok: true };
  const header = req.headers["authorization"] || "";
  const m = header.match(/^Bearer (.+)$/);
  if (!m) return { ok: false, reason: "missing bearer" };
  try {
    const claims = verifyBearer(m[1]);
    return { ok: true, claims };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
