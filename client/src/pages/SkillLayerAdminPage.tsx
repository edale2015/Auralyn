import { useEffect, useState } from "react";
import { platformAdminApi } from "../lib/platformAdminApi";
import DeploymentReadinessCard from "../components/platform/DeploymentReadinessCard";
import ReleaseGateCard from "../components/platform/ReleaseGateCard";
import ReviewQueueCard from "../components/platform/ReviewQueueCard";
import TenantCasesCard from "../components/platform/TenantCasesCard";
import CompareDiffsCard from "../components/platform/CompareDiffsCard";
import GraphMetricsCard from "../components/platform/GraphMetricsCard";
import ComplaintRolloutManagerCard from "../components/platform/ComplaintRolloutManagerCard";
import RuleGovernanceEditorCard from "../components/platform/RuleGovernanceEditorCard";
import CompareDiffExplorerCard from "../components/platform/CompareDiffExplorerCard";
import ComplaintHardeningQueueCard from "../components/platform/ComplaintHardeningQueueCard";
import GoldenCaseAutoGeneratorCard from "../components/platform/GoldenCaseAutoGeneratorCard";
import ReleaseGateHistoryCard from "../components/platform/ReleaseGateHistoryCard";
import RuleSuggestionCard from "../components/platform/RuleSuggestionCard";
import ExplainabilityScoreCard from "../components/platform/ExplainabilityScoreCard";
import GraphEdgeGuardCard from "../components/platform/GraphEdgeGuardCard";

const SECTIONS = [
  "2.0–2.2 Core Platform",
  "2.3 Hardening & Learning",
  "2.4–2.6 Intelligence",
] as const;

type Section = (typeof SECTIONS)[number];

export default function SkillLayerAdminPage() {
  const [deploymentReadiness, setDeploymentReadiness] = useState<any>(null);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [tenantCases, setTenantCases] = useState<any[]>([]);
  const [compareDiffs, setCompareDiffs] = useState<any[]>([]);
  const [graphMetrics, setGraphMetrics] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<Section>("2.0–2.2 Core Platform");

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
    <div className="min-h-screen bg-slate-100">
      <div className="border-b bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Skill Layer Platform Admin</h1>
            <p className="text-sm text-slate-500">
              2.0 readiness · 2.1 metrics · 2.2 control plane · 2.3 hardening · 2.4–2.6 intelligence
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

        {error && (
          <div className="mx-auto mt-2 max-w-7xl rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mx-auto mt-3 max-w-7xl flex gap-2">
          {SECTIONS.map((s) => (
            <button
              key={s}
              data-testid={`button-admin-section-${s.replace(/[^a-z0-9]/gi, "-")}`}
              onClick={() => setActiveSection(s)}
              className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-all ${
                activeSection === s
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl p-6">
        {activeSection === "2.0–2.2 Core Platform" && (
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <DeploymentReadinessCard result={deploymentReadiness} />
              <ReleaseGateCard />
              <ReviewQueueCard queue={reviewQueue} />
              <TenantCasesCard rows={tenantCases} />
              <CompareDiffsCard rows={compareDiffs} />
              <GraphMetricsCard result={graphMetrics} />
              <ComplaintRolloutManagerCard />
              <RuleGovernanceEditorCard />
            </div>
            <CompareDiffExplorerCard />
          </div>
        )}

        {activeSection === "2.3 Hardening & Learning" && (
          <div className="grid gap-6 xl:grid-cols-2">
            <ComplaintHardeningQueueCard />
            <GoldenCaseAutoGeneratorCard />
            <ReleaseGateHistoryCard />
            <RuleSuggestionCard />
          </div>
        )}

        {activeSection === "2.4–2.6 Intelligence" && (
          <div className="grid gap-6 xl:grid-cols-2">
            <GraphEdgeGuardCard />
            <ExplainabilityScoreCard />
          </div>
        )}
      </div>
    </div>
  );
}
