import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import type { AuthUser, AuthSessionPayload, LoginRequest, LoginResponse, UserRole } from "../types/auth";

const JWT_SECRET = process.env.APP_JWT_SECRET ?? "";
const JWT_EXPIRES_IN = "15m";
const REFRESH_EXPIRES_IN = "7d";

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[STARTUP FATAL] APP_JWT_SECRET environment variable is required in production. " +
      "Set it to a random 64-character string."
    );
  } else {
    console.warn(
      "[authService] WARNING: APP_JWT_SECRET not set. Using insecure dev fallback. " +
      "This MUST be set before going to production."
    );
  }
}

const EFFECTIVE_SECRET = JWT_SECRET || "dev_only_DO_NOT_USE_IN_PRODUCTION_auralyn_local";

type DemoUserRecord = AuthUser & {
  passwordHash: string;
};

const SALT_ROUNDS = 12;

async function buildDemoUser(
  userId: string,
  email: string,
  displayName: string,
  role: UserRole,
  plaintextPassword: string
): Promise<DemoUserRecord> {
  const envPassword = process.env[`DEMO_PASSWORD_${role.toUpperCase()}`];
  const password = envPassword ?? plaintextPassword;
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  return { userId, email, displayName, role, organizationId: "default_org", isActive: true, passwordHash };
}

let _demoUsersCache: DemoUserRecord[] | null = null;

async function getDemoUsers(): Promise<DemoUserRecord[]> {
  if (_demoUsersCache) return _demoUsersCache;
  _demoUsersCache = await Promise.all([
    buildDemoUser("admin_demo", "admin@example.com", "Admin Demo", "admin", "admin123"),
    buildDemoUser("physician_demo", "physician@example.com", "Physician Demo", "physician", "physician123"),
    buildDemoUser("staff_demo", "staff@example.com", "Staff Demo", "staff", "staff123"),
    buildDemoUser("patient_demo", "patient@example.com", "Patient Demo", "patient", "patient123"),
  ]);
  return _demoUsersCache;
}

export class AuthService {
  async login(input: LoginRequest): Promise<LoginResponse> {
    const email = input.email.trim().toLowerCase();
    const users = await getDemoUsers();
    const user = users.find((u) => u.email?.toLowerCase() === email);

    if (!user || !user.isActive) {
      throw new Error("Invalid credentials");
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new Error("Invalid credentials");
    }

    const payload: AuthSessionPayload = {
      userId: user.userId,
      role: user.role,
      organizationId: user.organizationId,
    };

    const token = jwt.sign(payload, EFFECTIVE_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      algorithm: "HS256",
    });

    const refreshToken = jwt.sign(
      { userId: user.userId, type: "refresh" },
      EFFECTIVE_SECRET,
      { expiresIn: REFRESH_EXPIRES_IN, algorithm: "HS256" }
    );

    return {
      ok: true,
      token,
      refreshToken,
      expiresIn: 15 * 60,
      user: {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        organizationId: user.organizationId,
        isActive: user.isActive,
      },
    };
  }

  async refresh(refreshToken: string): Promise<{ token: string; expiresIn: number }> {
    let payload: any;
    try {
      payload = jwt.verify(refreshToken, EFFECTIVE_SECRET, { algorithms: ["HS256"] });
    } catch {
      throw new Error("Invalid or expired refresh token");
    }
    if (payload.type !== "refresh") throw new Error("Not a refresh token");

    const users = await getDemoUsers();
    const user = users.find((u) => u.userId === payload.userId && u.isActive);
    if (!user) throw new Error("User not found or inactive");

    const newAccessToken = jwt.sign(
      { userId: user.userId, role: user.role, organizationId: user.organizationId } as AuthSessionPayload,
      EFFECTIVE_SECRET,
      { expiresIn: JWT_EXPIRES_IN, algorithm: "HS256" }
    );

    return { token: newAccessToken, expiresIn: 15 * 60 };
  }

  verifyToken(token: string): AuthSessionPayload {
    return jwt.verify(token, EFFECTIVE_SECRET, { algorithms: ["HS256"] }) as AuthSessionPayload;
  }

  async getUserFromToken(token: string): Promise<AuthUser | null> {
    try {
      const payload = this.verifyToken(token);
      const users = await getDemoUsers();
      const user = users.find((u) => u.userId === payload.userId);
      if (!user || !user.isActive) return null;
      return {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        organizationId: user.organizationId,
        isActive: user.isActive,
      };
    } catch {
      return null;
    }
  }

  hasRole(userRole: UserRole, allowed: UserRole[]): boolean {
    return allowed.includes(userRole);
  }
}

export const authService = new AuthService();
