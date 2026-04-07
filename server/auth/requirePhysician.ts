import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "./unifiedAuth";

// BUG FIXED: original used process.env.JWT_SECRET + a custom PhysicianClaims type
// that didn't match tokens issued by unifiedAuth.signAccessToken. The token shape
// from unifiedAuth uses { id, email, role } (AuthUser), not { sub, physician }.
// A token with role:"physician" but no physician:true field would be blocked by:
//   if (!decoded.physician && decoded.role !== "physician")
// because !undefined === true. The role check saved it, but the two paths being
// out of sync is a latent footgun for anyone adding physician:true to future tokens.
//
// FIX: delegate entirely to verifyAccessToken so there is ONE token verification
// path. requirePhysician is now a thin role-check wrapper.

declare global {
  namespace Express {
    interface Request {
      physician?: {
        id: string;
        email: string;
        role: string;
        clinicId?: string;
      };
    }
  }
}

export function requirePhysician(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const auth = req.headers.authorization;

  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  try {
    const token = auth.slice("Bearer ".length);
    const decoded = verifyAccessToken(token);

    if (decoded.role !== "physician" && decoded.role !== "admin") {
      res.status(403).json({ error: "Physician or admin access required" });
      return;
    }

    req.physician = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      clinicId: decoded.clinicId,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
