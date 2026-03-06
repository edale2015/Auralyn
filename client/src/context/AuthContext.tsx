import { createContext, useContext, useMemo, useState } from "react";

type AuthUser = {
  userId: string;
  email?: string;
  displayName?: string;
  role: "admin" | "physician" | "staff" | "patient";
  organizationId?: string;
  isActive: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  authFetch: typeof fetch;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "app_auth_token";
const USER_KEY = "app_auth_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(false);

  async function login(email: string, password: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/roleAuth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      setToken(data.token);
      setUser(data.user);

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  const authFetch: typeof fetch = (input, init = {}) => {
    const headers = new Headers((init as RequestInit).headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input as RequestInfo, { ...(init as RequestInit), headers });
  };

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, loading, login, logout, authFetch }),
    [user, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
