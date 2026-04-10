import { Router } from "express";
import { buildSmartLaunchUrl, exchangeCodeForToken } from "../ehr/smartAuth";

const router = Router();

router.get("/launch", (req, res) => {
  try {
    const iss    = req.query.iss    as string | undefined;
    const launch = req.query.launch as string | undefined;

    const url = buildSmartLaunchUrl({
      iss:    iss    ?? undefined,
      launch: launch ?? undefined,
    });

    res.redirect(url);
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get("/callback", async (req, res) => {
  try {
    const code = req.query.code as string | undefined;
    if (!code) return res.status(400).json({ ok: false, error: "code query parameter required" });

    const token = await exchangeCodeForToken(code);
    res.json({ ok: true, ...token });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

router.get("/status", (_req, res) => {
  res.json({
    ok:          true,
    configured:  !!(process.env.EPIC_ISSUER && process.env.SMART_CLIENT_ID && process.env.FHIR_BASE),
    endpoints: {
      launch:   "/smart/launch?iss=<EPIC_ISSUER>&launch=<launch_token>",
      callback: "/smart/callback?code=<auth_code>",
    },
  });
});

export default router;
