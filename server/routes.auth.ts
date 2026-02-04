import { Router } from "express";
import { setProviderSession, clearProviderSession, isSessionValid } from "./auth";

export const authRouter = Router();

authRouter.post("/api/auth/login", (req, res) => {
  const pw = String(req.body?.password || "");
  const expected = process.env.CLINICIAN_PASSWORD;

  if (!expected) return res.status(500).json({ ok: false, error: "Missing CLINICIAN_PASSWORD" });
  if (pw !== expected) return res.status(401).json({ ok: false, error: "Invalid password" });

  try {
    setProviderSession(res);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || "Session error" });
  }
});

authRouter.post("/api/auth/logout", (_req, res) => {
  clearProviderSession(res);
  return res.json({ ok: true });
});

authRouter.get("/api/auth/me", (req, res) => {
  const authenticated = isSessionValid(req);
  return res.json({ ok: true, authenticated });
});
