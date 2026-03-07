import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity } from "lucide-react";

type HealthComponent = {
  key: string;
  label: string;
  score: number;
  detail: string;
};

type HealthScore = {
  overallScore: number;
  components: HealthComponent[];
  generatedAt: string;
};

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 50) return "text-amber-500";
  return "text-red-500";
}

function scoreBadgeVariant(score: number): "secondary" | "default" | "destructive" {
  if (score >= 80) return "secondary";
  if (score >= 50) return "default";
  return "destructive";
}

export default function ClinicalWorkflowHealth() {
  const { authFetch } = useAuth();
  const [health, setHealth] = useState<HealthScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await authFetch("/api/clinicalWorkflowHealth");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load");
        setHealth(json);
      } catch (err: any) {
        setError(err?.message ?? "Error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex justify-center py-12" data-testid="status-loading">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-sm text-destructive" data-testid="text-error">{error}</div>
      </div>
    );
  }

  if (!health) return null;

  return (
    <div className="p-6 space-y-4" data-testid="page-clinical-workflow-health">
      <div className="flex items-center gap-3">
        <Activity className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Clinical Workflow Health</h2>
      </div>

      <Card>
        <CardContent className="pt-6 text-center">
          <div className={`text-5xl font-bold ${scoreColor(health.overallScore)}`} data-testid="overall-score">
            {health.overallScore}
          </div>
          <div className="text-sm text-muted-foreground mt-1">Overall Health Score</div>
          <div className="text-xs text-muted-foreground mt-2">
            Generated {new Date(health.generatedAt).toLocaleString()}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {health.components.map((comp) => (
          <Card key={comp.key} data-testid={`health-component-${comp.key}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{comp.label}</span>
                <Badge variant={scoreBadgeVariant(comp.score)}>
                  {comp.score}
                </Badge>
              </div>
              <div className="w-full bg-muted rounded-full h-2 mb-2">
                <div
                  className={`h-2 rounded-full ${
                    comp.score >= 80 ? "bg-green-500" : comp.score >= 50 ? "bg-amber-400" : "bg-red-500"
                  }`}
                  style={{ width: `${Math.min(100, comp.score)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{comp.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
