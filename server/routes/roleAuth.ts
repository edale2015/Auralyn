import { Router } from "express";
import { authService } from "../services/authService";
import { requireRole } from "../middleware/requireRole";

export const roleAuthRouter = Router();

roleAuthRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    const result = await authService.login({
      email: String(email || ""),
      password: String(password || "")
    });
    res.json(result);
  } catch (err: any) {
    res.status(401).json({
      error: err?.message ?? "Login failed"
    });
  }
});

roleAuthRouter.get("/me", requireRole(["admin", "physician", "staff", "patient"]), async (req, res) => {
  res.json({ user: req.authUser });
});
