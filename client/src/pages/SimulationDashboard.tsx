import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SimulationDashboard() {
  const [n, setN] = useState(1000);
  const [runKey, setRunKey] = useState(0);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["/api/sim-cohort/summary", n, runKey],
    queryFn: async () => {
      const res = await fetch(`/api/sim-cohort/summary?n=${n}`);
      return res.json();
    },
    enabled: runKey > 0,
  });

  const statBox = (label: string, value: string | number, sub?: string) => (
    <div className="rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs font-medium text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto" data-testid="simulation-dashboard">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Simulation Engine</h1>
          <p className="text-sm text-gray-500 mt-0.5">Run synthetic patient cohorts through the clinical decision engine</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
            data-testid="select-sim-size"
          >
            <option value={100}>100 patients</option>
            <option value={1000}>1,000 patients</option>
            <option value={5000}>5,000 patients</option>
            <option value={10000}>10,000 patients</option>
          </select>
          <Button
            onClick={() => setRunKey((k) => k + 1)}
            disabled={isLoading || isFetching}
            data-testid="button-run-simulation"
          >
            {isLoading || isFetching ? "Simulating…" : "Run Simulation"}
          </Button>
        </div>
      </div>

      {!data && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500 text-sm">
            Select a cohort size and click Run Simulation to begin.
          </CardContent>
        </Card>
      )}

      {(isLoading || isFetching) && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500 text-sm">
            Simulating {n.toLocaleString()} patients…
          </CardContent>
        </Card>
      )}

      {data && !isFetching && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {statBox("Total Runs", data.totalRuns?.toLocaleString())}
            {statBox("Antibiotic Rate", `${((data.antibioticRate ?? 0) * 100).toFixed(1)}%`, "of simulated patients")}
            {statBox("No-Antibiotic Rate", `${((data.noAntibioticRate ?? 0) * 100).toFixed(1)}%`)}
            {statBox("Mean Centor Score", data.meanCentorScore?.toFixed(2))}
            {statBox("Mean Probability", ((data.meanProbability ?? 0) * 100).toFixed(1) + "%")}
            {statBox("High Prob (>60%)", data.highProbabilityCount?.toLocaleString(), "patients")}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Interpretation</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600 space-y-1">
              <p>
                In this synthetic cohort, <strong>{((data.antibioticRate ?? 0) * 100).toFixed(1)}%</strong> of patients met criteria for antibiotic consideration (probability &gt;50%).
              </p>
              <p>
                Mean Centor score was <strong>{data.meanCentorScore?.toFixed(2)}</strong>. Use repeated simulations to calibrate decision thresholds across clinic populations.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
