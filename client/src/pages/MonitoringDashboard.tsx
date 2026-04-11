import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Alert {
  type: string;
  message: string;
  severity: "warning" | "critical";
  delta?: number;
  probability?: number;
  decision?: string;
}

export default function MonitoringDashboard() {
  const [driftInput, setDriftInput] = useState({ antibioticRate: 0.5, returnVisitRate: 0.25 });
  const [riskInput, setRiskInput]   = useState({ decision: "NO_ANTIBIOTIC", probability: 0.75 });
  const [driftAlerts, setDriftAlerts] = useState<Alert[]>([]);
  const [riskAlerts,  setRiskAlerts]  = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);

  async function checkDrift() {
    setLoading(true);
    try {
      const res = await fetch("/api/monitoring/drift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(driftInput),
      });
      const data = await res.json();
      setDriftAlerts(data.alerts || []);
    } finally {
      setLoading(false);
    }
  }

  async function checkRisk() {
    setLoading(true);
    try {
      const res = await fetch("/api/monitoring/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(riskInput),
      });
      const data = await res.json();
      setRiskAlerts(data.alerts || []);
    } finally {
      setLoading(false);
    }
  }

  const alertColor = (severity: string) =>
    severity === "critical"
      ? "border-red-300 bg-red-50 text-red-800"
      : "border-amber-300 bg-amber-50 text-amber-800";

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto" data-testid="monitoring-dashboard">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">System Monitoring</h1>
        <p className="text-sm text-gray-500 mt-0.5">Drift detection and risk governance for the clinical AI engine</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Drift Detection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Antibiotic Rate</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                  value={driftInput.antibioticRate}
                  onChange={(e) => setDriftInput((p) => ({ ...p, antibioticRate: parseFloat(e.target.value) }))}
                  data-testid="input-antibiotic-rate"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Return Visit Rate</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                  value={driftInput.returnVisitRate}
                  onChange={(e) => setDriftInput((p) => ({ ...p, returnVisitRate: parseFloat(e.target.value) }))}
                  data-testid="input-return-visit-rate"
                />
              </div>
            </div>
            <Button size="sm" onClick={checkDrift} disabled={loading} data-testid="button-check-drift">
              Check Drift
            </Button>
            <div className="space-y-2 min-h-[40px]" data-testid="drift-alerts">
              {driftAlerts.length === 0
                ? <p className="text-xs text-gray-400">No alerts — system within baseline</p>
                : driftAlerts.map((a, i) => (
                    <div key={i} className={`rounded-lg border px-3 py-2 text-xs font-medium ${alertColor(a.severity)}`} data-testid={`drift-alert-${i}`}>
                      {a.message}{a.delta !== undefined && ` (Δ${a.delta})`}
                    </div>
                  ))
              }
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Risk Governance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Decision</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                  value={riskInput.decision}
                  onChange={(e) => setRiskInput((p) => ({ ...p, decision: e.target.value }))}
                  data-testid="select-decision"
                >
                  <option value="NO_ANTIBIOTIC">NO_ANTIBIOTIC</option>
                  <option value="ANTIBIOTIC">ANTIBIOTIC</option>
                  <option value="CONSIDER_ANTIBIOTIC">CONSIDER_ANTIBIOTIC</option>
                  <option value="TEST_OR_DELAYED_RX">TEST_OR_DELAYED_RX</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Probability</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                  value={riskInput.probability}
                  onChange={(e) => setRiskInput((p) => ({ ...p, probability: parseFloat(e.target.value) }))}
                  data-testid="input-probability"
                />
              </div>
            </div>
            <Button size="sm" onClick={checkRisk} disabled={loading} data-testid="button-check-risk">
              Evaluate Risk
            </Button>
            <div className="space-y-2 min-h-[40px]" data-testid="risk-alerts">
              {riskAlerts.length === 0
                ? <p className="text-xs text-gray-400">No risk alerts</p>
                : riskAlerts.map((a, i) => (
                    <div key={i} className={`rounded-lg border px-3 py-2 text-xs font-medium ${alertColor(a.severity)}`} data-testid={`risk-alert-${i}`}>
                      {a.message}
                    </div>
                  ))
              }
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
