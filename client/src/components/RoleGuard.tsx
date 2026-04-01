import { useQuery } from "@tanstack/react-query";

type AllowedRole = "admin" | "physician" | "staff" | "patient" | "any";

interface RoleGuardProps {
  allowedRoles: AllowedRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface AuthUser {
  id: number;
  username: string;
  role: string;
  email?: string;
}

export function useCurrentUser() {
  return useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 30_000,
  });
}

export default function RoleGuard({ allowedRoles, children, fallback }: RoleGuardProps) {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="text-muted-foreground text-sm">Verifying access...</div>
      </div>
    );
  }

  if (allowedRoles.includes("any")) {
    return <>{children}</>;
  }

  if (!user) {
    return fallback ?? (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-3">
        <div className="text-destructive font-semibold text-base">Authentication Required</div>
        <div className="text-muted-foreground text-sm text-center max-w-xs">
          You must be logged in to access this page.
        </div>
        <a href="/login" className="text-primary underline text-sm">Go to Login</a>
      </div>
    );
  }

  const userRole = user.role?.toLowerCase() ?? "patient";
  const hasAccess = allowedRoles.some(r =>
    r === "any" ||
    r === userRole ||
    (r === "staff" && (userRole === "physician" || userRole === "admin")) ||
    (r === "physician" && userRole === "admin")
  );

  if (!hasAccess) {
    return fallback ?? (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-3" data-testid="access-denied">
        <div className="text-destructive font-semibold text-base">Access Denied</div>
        <div className="text-muted-foreground text-sm text-center max-w-xs">
          Your role (<span className="font-mono text-xs bg-muted px-1 rounded">{userRole}</span>) does not have permission to access this page.
        </div>
        <div className="text-muted-foreground text-xs">Required: {allowedRoles.join(", ")}</div>
      </div>
    );
  }

  return <>{children}</>;
}
