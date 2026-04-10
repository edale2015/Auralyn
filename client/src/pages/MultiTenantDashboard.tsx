import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

const TENANTS = ["default", "clinicA", "clinicB", "clinicC"];

function TenantSelector({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      data-testid="select-tenant"
      className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
    >
      {TENANTS.map(t => (
        <option key={t} value={t}>{t === "default" ? "Default" : t}</option>
      ))}
    </select>
  );
}

interface TenantStats {
  tenant: string;
  patientCount: number;
  avgLatencyMs: number;
  erRate: number;
  slo?: { availability: number; latency: boolean };
}

export default function MultiTenantDashboard() {
  const [tenant, setTenant] = useState("default");

  const { data, isLoading } = useQuery<TenantStats>({
    queryKey: ["/api/tenants/stats", tenant],
    queryFn: () =>
      fetch(`/api/tenants/stats?tenant=${encodeURIComponent(tenant)}`).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const anomaly = data && data.erRate > 0.3 ? "⚠ High ER spike detected" : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold mr-auto">🏢 Multi-Tenant Dashboard</h1>
        <TenantSelector value={tenant} onChange={setTenant} />
      </div>

      {anomaly && (
        <div
          data-testid="anomaly-card"
          className="mb-4 px-4 py-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm font-medium"
        >
          {anomaly}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-gray-900 rounded-xl h-24 animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Patients Today"      value={String(data.patientCount)} testId="stat-patient-count" />
          <StatCard label="Avg Latency (ms)"    value={String(data.avgLatencyMs)} testId="stat-avg-latency"  />
          <StatCard label="ER Rate"             value={(data.erRate * 100).toFixed(1) + "%"} testId="stat-er-rate" />
          <StatCard
            label="SLO Availability"
            value={data.slo ? (data.slo.availability * 100).toFixed(1) + "%" : "—"}
            testId="stat-slo-availability"
            ok={data.slo?.latency}
          />
        </div>
      ) : (
        <p className="text-gray-500 text-sm">No data for tenant <span className="text-white">{tenant}</span>.</p>
      )}
    </div>
  );
}

function StatCard({ label, value, testId, ok }: { label: string; value: string; testId: string; ok?: boolean }) {
  return (
    <div
      data-testid={testId}
      className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-1"
    >
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-2xl font-bold ${ok === false ? "text-red-400" : "text-white"}`}>{value}</span>
    </div>
  );
}
