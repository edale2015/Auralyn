import jwt from "jsonwebtoken";
import type { AuthUser, AuthSessionPayload, LoginRequest, LoginResponse, UserRole } from "../types/auth";

const JWT_SECRET = process.env.APP_JWT_SECRET || "dev_only_change_me";
const JWT_EXPIRES_IN = "12h";

type DemoUserRecord = AuthUser & {
  password: string;
};

const DEMO_USERS: DemoUserRecord[] = [
  {
    userId: "admin_demo",
    email: "admin@example.com",
    displayName: "Admin Demo",
    role: "admin",
    organizationId: "default_org",
    isActive: true,
    password: "admin123"
  },
  {
    userId: "physician_demo",
    email: "physician@example.com",
    displayName: "Physician Demo",
    role: "physician",
    organizationId: "default_org",
    isActive: true,
    password: "physician123"
  },
  {
    userId: "staff_demo",
    email: "staff@example.com",
    displayName: "Staff Demo",
    role: "staff",
    organizationId: "default_org",
    isActive: true,
    password: "staff123"
  },
  {
    userId: "patient_demo",
    email: "patient@example.com",
    displayName: "Patient Demo",
    role: "patient",
    organizationId: "default_org",
    isActive: true,
    password: "patient123"
  }
];

export class AuthService {
  async login(input: LoginRequest): Promise<LoginResponse> {
    const email = input.email.trim().toLowerCase();
    const user = DEMO_USERS.find((u) => u.email?.toLowerCase() === email);

    if (!user || !user.isActive || user.password !== input.password) {
      throw new Error("Invalid credentials");
    }

    const payload: AuthSessionPayload = {
      userId: user.userId,
      role: user.role,
      organizationId: user.organizationId
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });

    return {
      ok: true,
      token,
      user: {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        organizationId: user.organizationId,
        isActive: user.isActive
      }
    };
  }

  verifyToken(token: string): AuthSessionPayload {
    return jwt.verify(token, JWT_SECRET) as AuthSessionPayload;
  }

  async getUserFromToken(token: string): Promise<AuthUser | null> {
    try {
      const payload = this.verifyToken(token);
      const user = DEMO_USERS.find((u) => u.userId === payload.userId);
      if (!user || !user.isActive) return null;

      return {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        organizationId: user.organizationId,
        isActive: user.isActive
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
