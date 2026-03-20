import { Router } from "express";
import { authService } from "../services/authService";
import { requireRole } from "../middleware/requireRole";
import { authRateLimiter } from "../middleware/rateLimiter";

export const roleAuthRouter = Router();

roleAuthRouter.post("/login", authRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    const result = await authService.login({
      email: String(email || ""),
      password: String(password || ""),
    });
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err?.message ?? "Login failed" });
  }
});

roleAuthRouter.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken || typeof refreshToken !== "string") {
      return res.status(400).json({ error: "refreshToken is required" });
    }
    const result = await authService.refresh(refreshToken);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(401).json({ error: err?.message ?? "Token refresh failed" });
  }
});

roleAuthRouter.get("/me", requireRole(["admin", "physician", "staff", "patient", "nurse", "viewer"]), async (req, res) => {
  res.json({ user: req.authUser });
});
