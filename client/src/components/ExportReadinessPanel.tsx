import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Shield, Loader2 } from "lucide-react";

type ReadinessCheck = {
  key: string;
  label: string;
  passed: boolean;
  detail?: string;
};

type ReadinessResult = {
  caseId: string;
  ready: boolean;
  checks: ReadinessCheck[];
};

type Props = { caseId: string };

export function ExportReadinessPanel({ caseId }: Props) {
  const { authFetch } = useAuth();
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await authFetch(`/api/exportReadiness/${caseId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to check readiness");
        setResult(json);
      } catch (err: any) {
        setError(err?.message ?? "Error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [caseId]);

  if (loading) {
    return (
      <Card data-testid={`export-readiness-${caseId}`}>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card data-testid={`export-readiness-${caseId}`}>
        <CardContent className="py-4">
          <p className="text-sm text-destructive" data-testid="text-error">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!result) return null;

  return (
    <Card data-testid={`export-readiness-${caseId}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Export Readiness
          <Badge
            variant={result.ready ? "secondary" : "destructive"}
            data-testid={`export-readiness-status-${caseId}`}
          >
            {result.ready ? "Ready" : "Not Ready"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {result.checks.map((check) => (
            <li
              key={check.key}
              className="flex items-center gap-2 text-sm"
              data-testid={`readiness-check-${check.key}`}
            >
              {check.passed ? (
                <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              )}
              <span className={check.passed ? "" : "font-medium"}>{check.label}</span>
              {check.detail && (
                <span className="text-xs text-muted-foreground ml-auto">{check.detail}</span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
