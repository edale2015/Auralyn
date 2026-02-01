import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Clock, CheckCircle, FileText, AlertCircle } from "lucide-react";

type Status = "pending_intake" | "pending_review" | "in_review" | "approved" | "closed";

interface StatusData {
  status: Status;
  encounterId?: number;
  lastUpdatedAt?: number;
  nextActionText?: string;
}

const statusConfig: Record<Status, { icon: any; color: string; title: string }> = {
  pending_intake: { icon: FileText, color: "text-blue-500", title: "Intake In Progress" },
  pending_review: { icon: Clock, color: "text-amber-500", title: "Waiting for Provider" },
  in_review: { icon: Clock, color: "text-amber-500", title: "Provider Reviewing" },
  approved: { icon: CheckCircle, color: "text-green-500", title: "Visit Complete" },
  closed: { icon: AlertCircle, color: "text-muted-foreground", title: "Visit Closed" }
};

export default function IntakeStatus() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const [, setLocation] = useLocation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusData, setStatusData] = useState<StatusData | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/intake/${token}/status`);
      const data = await res.json();
      if (data.ok) {
        setStatusData(data);
        setError("");
      } else {
        setError(data.error || "Could not load status");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="status-loading">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <p className="mt-4 text-muted-foreground">Loading status...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="status-error">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!statusData) return null;

  const config = statusConfig[statusData.status] || statusConfig.pending_intake;
  const Icon = config.icon;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="status-page">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Icon className={`h-16 w-16 mx-auto mb-4 ${config.color}`} />
          <CardTitle data-testid="text-status-title">{config.title}</CardTitle>
          <CardDescription data-testid="text-status-description">
            {statusData.nextActionText}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusData.lastUpdatedAt && (
            <p className="text-center text-sm text-muted-foreground">
              Last updated: {new Date(statusData.lastUpdatedAt).toLocaleString()}
            </p>
          )}

          {statusData.status === "pending_intake" && (
            <Button
              data-testid="button-continue-intake"
              className="w-full"
              onClick={() => setLocation(`/intake/${token}`)}
            >
              Continue Intake
            </Button>
          )}

          {statusData.status === "approved" && (
            <Button
              data-testid="button-view-summary"
              className="w-full"
              onClick={() => setLocation(`/intake/${token}/summary`)}
            >
              View Visit Summary
            </Button>
          )}

          <Button
            data-testid="button-refresh-status"
            variant="outline"
            className="w-full"
            onClick={fetchStatus}
          >
            Refresh Status
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
