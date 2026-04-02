import { Router } from "express";
import { setProviderSession, clearProviderSession, isSessionValid } from "./auth";
import { loginLimiter } from "./rateLimit";

export const authRouter = Router();

// ── Q11: Legacy Auth Deprecation ──────────────────────────────────────────────
// This single-password auth system (CLINICIAN_PASSWORD) is DEPRECATED.
// All new integrations must use the JWT role-based system:
//   POST /api/roleAuth/login  → { email, password } → { token, role }
//   POST /api/roleAuth/refresh → { refreshToken } → { token }
// Accounts: admin@example.com / admin123 (admin), physician@example.com / physician123 (physician)
// The legacy system will be removed in a future version. Sunset target: v2.0.0.
const DEPRECATION_HEADERS = {
  "Deprecation": "true",
  "Sunset": "2026-12-31T00:00:00Z",
  "Link": '</api/roleAuth/login>; rel="successor-version"',
  "Warning": '299 - "This legacy auth endpoint is deprecated. Migrate to POST /api/roleAuth/login"',
};

authRouter.post("/api/auth/login", loginLimiter, (req, res) => {
  // Always emit deprecation headers, regardless of auth outcome
  Object.entries(DEPRECATION_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  const pw = String(req.body?.password || "");
  const expected = process.env.CLINICIAN_PASSWORD;

  if (!expected) return res.status(500).json({ ok: false, error: "Missing CLINICIAN_PASSWORD" });
  if (pw !== expected) return res.status(401).json({ ok: false, error: "Invalid password" });

  try {
    setProviderSession(res);
    return res.json({
      ok: true,
      _deprecated: true,
      _deprecationNotice: "This auth endpoint is deprecated. Please migrate to POST /api/roleAuth/login for JWT role-based auth.",
      _sunsetDate: "2026-12-31",
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || "Session error" });
  }
});

authRouter.post("/api/auth/logout", (_req, res) => {
  Object.entries(DEPRECATION_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  clearProviderSession(res);
  return res.json({ ok: true, _deprecated: true });
});

authRouter.get("/api/auth/me", (req, res) => {
  const authenticated = isSessionValid(req);
  Object.entries(DEPRECATION_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  return res.json({
    ok: true,
    authenticated,
    _deprecated: true,
    _deprecationNotice: "Legacy session auth. Migrate to GET /api/roleAuth/me with JWT Bearer token.",
  });
});
