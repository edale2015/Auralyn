import { Router, Request, Response, NextFunction } from "express";
import session from "express-session";

export const authRouter = Router();

declare module "express-session" {
  interface SessionData {
    provider?: {
      authenticated: boolean;
      email?: string;
      loginAt: string;
    };
  }
}

const PROVIDER_PASSWORD = process.env.PROVIDER_PASSWORD || "clinic2026";

export function setupSession(sessionSecret: string) {
  return session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: "provider_session",
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
  });
}

export function requireProviderAuth(req: Request, res: Response, next: NextFunction) {
  // Check session first (preferred)
  if (req.session?.provider?.authenticated) {
    return next();
  }

  // Fallback: check X-Provider-Key header (for dev/scripts)
  const authHeader = req.headers["x-provider-key"];
  const providerKey = process.env.PROVIDER_API_KEY;

  if (providerKey && authHeader === providerKey) {
    return next();
  }

  return res.status(401).json({ 
    ok: false, 
    error: "Unauthorized. Please log in.",
    needsLogin: true 
  });
}

authRouter.post("/api/auth/login", (req: Request, res: Response) => {
  const { password, email } = req.body;

  if (!password) {
    return res.status(400).json({ ok: false, error: "Password is required" });
  }

  if (password !== PROVIDER_PASSWORD) {
    return res.status(401).json({ ok: false, error: "Invalid password" });
  }

  req.session.provider = {
    authenticated: true,
    email: email || "provider@clinic.local",
    loginAt: new Date().toISOString(),
  };

  req.session.save((err) => {
    if (err) {
      console.error("Session save error:", err);
      return res.status(500).json({ ok: false, error: "Session error" });
    }
    return res.json({ 
      ok: true, 
      message: "Login successful",
      email: req.session.provider?.email 
    });
  });
});

authRouter.post("/api/auth/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destroy error:", err);
      return res.status(500).json({ ok: false, error: "Logout failed" });
    }
    res.clearCookie("provider_session");
    return res.json({ ok: true, message: "Logged out" });
  });
});

authRouter.get("/api/auth/me", (req: Request, res: Response) => {
  if (req.session?.provider?.authenticated) {
    return res.json({
      ok: true,
      authenticated: true,
      email: req.session.provider.email,
      loginAt: req.session.provider.loginAt,
    });
  }

  // Check if using API key
  const authHeader = req.headers["x-provider-key"];
  const providerKey = process.env.PROVIDER_API_KEY;
  if (providerKey && authHeader === providerKey) {
    return res.json({
      ok: true,
      authenticated: true,
      email: "api-key-user",
      method: "api-key",
    });
  }

  return res.json({ ok: true, authenticated: false });
});
