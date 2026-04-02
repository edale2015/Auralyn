import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, CheckCircle2, AlertTriangle, RefreshCw,
  Building2, Zap, Clock, ToggleRight,
} from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  if (status === "healthy") {
    return (
      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800 gap-1">
        <CheckCircle2 className="w-3 h-3" /> Healthy
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800 gap-1">
      <AlertTriangle className="w-3 h-3" /> {status}
    </Badge>
  );
}

function FeatureBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-[10px]">
      ON
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-[10px] opacity-60">
      OFF
    </Badge>
  );
}

export default function ClinicHealthDashboard() {
  const { data, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery<any>({
    queryKey: ["/api/clinic-health"],
    refetchInterval: 30_000,
  });

  const health: any[] = data?.health ?? [];
  const features: any[] = data?.features ?? [];

  const healthyCount = health.filter((r) => r.status === "healthy").length;
  const unhealthyCount = health.length - healthyCount;
  const featuresEnabled = features.filter((f) => f.enabled).length;
  const uniqueClinics = new Set([...health.map((r) => r.clinic_id), ...features.map((f) => f.clinic_id)]).size;

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null;

  const KPI_CARDS = [
    {
      label: "Total Clinics",
      value: isLoading ? null : uniqueClinics,
      icon: Building2,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-950/30",
    },
    {
      label: "Healthy",
      value: isLoading ? null : healthyCount,
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-50 dark:bg-green-950/30",
    },
    {
      label: "Unhealthy",
      value: isLoading ? null : unhealthyCount,
      icon: AlertTriangle,
      color: unhealthyCount > 0 ? "text-red-600" : "text-muted-foreground",
      bg: unhealthyCount > 0 ? "bg-red-50 dark:bg-red-950/30" : "bg-muted/30",
    },
    {
      label: "Active Features",
      value: isLoading ? null : featuresEnabled,
      icon: ToggleRight,
      color: "text-violet-600",
      bg: "bg-violet-50 dark:bg-violet-950/30",
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto" data-testid="clinic-health-dashboard">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Clinic Health Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time health status and feature flags across all clinics
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          {isFetching && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          {lastUpdated && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> Updated {lastUpdated}
            </span>
          )}
        </div>
      </div>

      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {KPI_CARDS.map((card) => (
          <Card key={card.label} data-testid={`kpi-${card.label.toLowerCase().replace(/\s/g, "-")}`}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center flex-shrink-0`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <div>
                  {isLoading ? (
                    <Skeleton className="h-7 w-12 mb-0.5" />
                  ) : (
                    <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                  )}
                  <div className="text-xs text-muted-foreground">{card.label}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Clinic Health Status */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Clinic Health Status
            </CardTitle>
            {!isLoading && (
              <Badge variant="outline" className="text-xs">
                {health.length} snapshot{health.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : health.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground" data-testid="clinic-health-empty">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No clinic health snapshots recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y" data-testid="clinic-health-table">
              {health.map((row: any) => (
                <div
                  key={`${row.clinic_id}-${row.created_at}`}
                  className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                  data-testid={`clinic-health-row-${row.clinic_id}`}
                >
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{row.clinic_id}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {new Date(row.created_at).toLocaleString()}
                    </div>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feature Flags */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Clinic Feature States
            </CardTitle>
            {!isLoading && (
              <Badge variant="outline" className="text-xs">
                {featuresEnabled}/{features.length} enabled
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : features.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground" data-testid="clinic-features-empty">
              <ToggleRight className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No clinic feature states recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y" data-testid="clinic-features-table">
              {features.map((row: any) => (
                <div
                  key={`${row.clinic_id}-${row.feature_name}`}
                  className="flex items-center gap-4 py-2.5 first:pt-0 last:pb-0"
                  data-testid={`clinic-feature-row-${row.clinic_id}-${row.feature_name}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{row.feature_name}</div>
                    <div className="text-xs text-muted-foreground">{row.clinic_id}</div>
                  </div>
                  <div className="text-xs text-muted-foreground hidden sm:block">
                    {new Date(row.updated_at).toLocaleDateString()}
                  </div>
                  <FeatureBadge enabled={row.enabled} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
