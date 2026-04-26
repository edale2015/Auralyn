import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getOrCreateCorrelationId } from "./correlation";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export function getCsrfToken(): string | null {
  const cookies = document.cookie.split(";");
  for (const c of cookies) {
    const [k, v] = c.trim().split("=");
    const name = (import.meta.env.VITE_CSRF_COOKIE_NAME as string) || "csrf_token";
    if (k?.trim() === name && v) return decodeURIComponent(v);
  }
  return null;
}

function getHeaders(method: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "x-correlation-id": getOrCreateCorrelationId(),
  };
  if (hasBody) headers["Content-Type"] = "application/json";

  const upper = method.toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(upper)) {
    const csrf = getCsrfToken();
    if (csrf) headers["x-csrf-token"] = csrf;
  }

  return headers;
}

export async function apiRequest(method: string, url: string, data?: unknown): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: getHeaders(method, data !== undefined),
    body: data !== undefined ? JSON.stringify(data) : undefined,
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()) || res.statusText}`);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401 }) => async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: getHeaders("GET", false),
    });
    if (on401 === "returnNull" && res.status === 401) return null as T;
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()) || res.statusText}`);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: { retry: false },
  },
});
