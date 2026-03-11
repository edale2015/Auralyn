import { useEffect, useState } from "react";
import { platformAdminApi } from "../lib/platformAdminApi";
import DeploymentReadinessCard from "../components/platform/DeploymentReadinessCard";
import ReleaseGateCard from "../components/platform/ReleaseGateCard";
import ReviewQueueCard from "../components/platform/ReviewQueueCard";
import TenantCasesCard from "../components/platform/TenantCasesCard";
import CompareDiffsCard from "../components/platform/CompareDiffsCard";
import GraphMetricsCard from "../components/platform/GraphMetricsCard";

export default function SkillLayerAdminPage() {
  const [deploymentReadiness, setDeploymentReadiness] = useState<any>(null);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [tenantCases, setTenantCases] = useState<any[]>([]);
  const [compareDiffs, setCompareDiffs] = useState<any[]>([]);
  const [graphMetrics, setGraphMetrics] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setError("");
      setLoading(true);
      const [dr, rq, tc, cd, gm] = await Promise.all([
        platformAdminApi.getDeploymentReadiness(),
        platformAdminApi.getReviewQueue(),
        platformAdminApi.getTenantCases(),
        platformAdminApi.getCompareDiffs(),
        platformAdminApi.getGraphMetrics(),
      ]);

      setDeploymentReadiness(dr.result);
      setReviewQueue(rq.queue ?? []);
      setTenantCases(tc.rows ?? []);
      setCompareDiffs(cd.rows ?? []);
      setGraphMetrics(gm.result);
    } catch (err: any) {
      setError(err.message ?? "Failed to load platform admin data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Skill Layer 2.1 Admin</h1>
              <p className="mt-1 text-sm text-slate-600">
                Platform readiness, release gates, review queues, compare diffs, and graph metrics
              </p>
            </div>
            <button
              data-testid="button-admin-refresh"
              onClick={load}
              disabled={loading}
              className="rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>

          {!!error && (
            <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <DeploymentReadinessCard result={deploymentReadiness} />
          <ReleaseGateCard />
          <ReviewQueueCard queue={reviewQueue} />
          <TenantCasesCard rows={tenantCases} />
          <CompareDiffsCard rows={compareDiffs} />
          <GraphMetricsCard result={graphMetrics} />
        </div>
      </div>
    </div>
  );
}
