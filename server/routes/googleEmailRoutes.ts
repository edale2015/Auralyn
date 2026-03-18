import { Router, Request, Response } from "express";
import crypto from "crypto";
import { requireRole } from "../middleware/requireRole";
import {
  buildGoogleEmailAuthUrl,
  exchangeGoogleEmailCode,
  sendGoogleEmail,
  upsertGoogleEmailConnection,
} from "../services/googleEmail";

const router = Router();
const auth = requireRole(["admin"]);

function signState(input: { clinicId: string; userId: string }) {
  const payload = JSON.stringify(input);
  const sig = crypto
    .createHmac("sha256", process.env.GOOGLE_EMAIL_STATE_SECRET || "dev-state")
    .update(payload)
    .digest("hex");
  return Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");
}

function verifyState(state: string) {
  const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  const expected = crypto
    .createHmac("sha256", process.env.GOOGLE_EMAIL_STATE_SECRET || "dev-state")
    .update(decoded.payload)
    .digest("hex");
  if (expected !== decoded.sig) {
    throw new Error("Invalid state signature");
  }
  return JSON.parse(decoded.payload) as { clinicId: string; userId: string };
}

router.get("/connect", auth, (req: Request, res: Response) => {
  const user = (req as any).user || {};
  const state = signState({
    clinicId: user.clinicId || "default",
    userId: user.id || "unknown",
  });
  const url = buildGoogleEmailAuthUrl(state);
  res.json({ url });
});

router.get("/oauth/callback", async (req: Request, res: Response) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    if (!code || !state) {
      res.status(400).send("Missing code or state");
      return;
    }
    const { clinicId, userId } = verifyState(state);
    const tokens = await exchangeGoogleEmailCode(code);
    if (!tokens.refresh_token) {
      res.status(400).send("No refresh token returned. Re-consent may be required.");
      return;
    }
    upsertGoogleEmailConnection({
      clinicId,
      userId,
      emailAddress: process.env.GOOGLE_EMAIL_FROM || "",
      refreshToken: tokens.refresh_token,
    });
    res.send("Google email connected successfully.");
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/send", auth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user || {};
    const data = await sendGoogleEmail({
      clinicId: user.clinicId || "default",
      userId: user.id || "unknown",
      to: req.body.to,
      subject: req.body.subject,
      body: req.body.body,
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
