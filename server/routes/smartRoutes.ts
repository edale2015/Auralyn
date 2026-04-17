/**
 * server/routes/smartRoutes.ts — SMART on FHIR OAuth 2.0 launch + callback
 *
 * FIX (T002 — delete legacy smartAuth.ts):
 *   Migrated from the deprecated server/ehr/smartAuth.ts wrapper to
 *   server/ehr/fhir/smartLaunch.ts directly.
 *
 *   Changes:
 *   1. buildAuthUrl() returns { url, state, codeVerifier } — redirect to .url
 *      and persist codeVerifier in an in-process PKCE state store keyed by state.
 *   2. exchangeCode() requires (code, iss, codeVerifier) — look up codeVerifier
 *      from the PKCE state store using the state query param on callback.
 *   3. PKCE entries expire after 10 minutes to prevent state store growth.
 */

import { Router }        from "express";
import { buildAuthUrl, exchangeCode } from "../ehr/fhir/smartLaunch";

const router = Router();

// ── In-process PKCE state store ───────────────────────────────────────────────
// Maps state → { codeVerifier, iss, expiresAt }.
// Entries expire after 10 minutes (SMART launch flows must complete quickly).

const PKCE_TTL_MS = 10 * 60 * 1000;

interface PKCEEntry {
  codeVerifier: string;
  iss:          string;
  expiresAt:    number;
}

const pkceStore = new Map<string, PKCEEntry>();

function cleanExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of pkceStore.entries()) {
    if (entry.expiresAt < now) pkceStore.delete(key);
  }
}

// ── Launch ────────────────────────────────────────────────────────────────────

router.get("/launch", (req, res) => {
  try {
    const iss    = req.query.iss    as string | undefined;
    const launch = req.query.launch as string | undefined;

    const result = buildAuthUrl({
      iss:    iss    ?? process.env.EPIC_ISSUER ?? "",
      launch: launch ?? undefined,
    });

    cleanExpiredEntries();
    pkceStore.set(result.state, {
      codeVerifier: result.codeVerifier,
      iss:          iss ?? process.env.EPIC_ISSUER ?? "",
      expiresAt:    Date.now() + PKCE_TTL_MS,
    });

    res.redirect(result.url);
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ── Callback ──────────────────────────────────────────────────────────────────

router.get("/callback", async (req, res) => {
  try {
    const code  = req.query.code  as string | undefined;
    const state = req.query.state as string | undefined;

    if (!code)  return res.status(400).json({ ok: false, error: "code query parameter required" });
    if (!state) return res.status(400).json({ ok: false, error: "state query parameter required" });

    const entry = pkceStore.get(state);
    if (!entry) {
      return res.status(400).json({ ok: false, error: "Unknown or expired PKCE state — restart SMART launch" });
    }
    if (entry.expiresAt < Date.now()) {
      pkceStore.delete(state);
      return res.status(400).json({ ok: false, error: "PKCE state expired — restart SMART launch" });
    }

    pkceStore.delete(state);

    const token = await exchangeCode(code, entry.iss, entry.codeVerifier);
    res.json({ ok: true, ...token });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ── Status ────────────────────────────────────────────────────────────────────

router.get("/status", (_req, res) => {
  res.json({
    ok:         true,
    configured: !!(process.env.EPIC_ISSUER && process.env.SMART_CLIENT_ID && process.env.FHIR_BASE),
    pkce:       "S256 (fhir/smartLaunch v2)",
    endpoints: {
      launch:   "/smart/launch?iss=<EPIC_ISSUER>&launch=<launch_token>",
      callback: "/smart/callback?code=<auth_code>&state=<state>",
    },
  });
});

export default router;
