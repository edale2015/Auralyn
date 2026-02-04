import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./queryClient";

interface AuthState {
  authenticated: boolean;
  email?: string;
  loginAt?: string;
  method?: string;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const authQuery = useQuery<AuthState>({
    queryKey: ["/api/auth/me"],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/logout", {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], { authenticated: false });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  return {
    isAuthenticated: authQuery.data?.authenticated ?? false,
    email: authQuery.data?.email,
    isLoading: authQuery.isLoading,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}

export function getProviderKey(): string | null {
  const envKey = import.meta.env?.VITE_PROVIDER_KEY as string | undefined;
  return envKey?.trim() || null;
}

export function providerHeaders(): Record<string, string> {
  const key = getProviderKey();
  return key ? { "X-Provider-Key": key } : {};
}
