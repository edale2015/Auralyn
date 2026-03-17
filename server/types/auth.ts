export type UserRole = "admin" | "physician" | "nurse" | "staff" | "patient" | "viewer";

export interface AuthUser {
  userId: string;
  email?: string;
  displayName?: string;
  role: UserRole;
  organizationId?: string;
  isActive: boolean;
}

export interface AuthSessionPayload {
  userId: string;
  role: UserRole;
  organizationId?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  ok: true;
  token: string;
  user: AuthUser;
}
