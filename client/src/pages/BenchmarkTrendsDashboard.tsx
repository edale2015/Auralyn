import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { Target } from "lucide-react";

export default function BenchmarkTrendsDashboard() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("app_auth_token");
    fetch("/api/benchmark-trends", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        rows: [
          { date: "2026-03-12", clinicType: "urgent_care", complaint: "dizziness", accuracy: 0.74, overrideRate: 0.22, escalationRate: 0.25 },
          { date: "2026-03-13", clinicType: "urgent_care", complaint: "dizziness", accuracy: 0.76, overrideRate: 0.21, escalationRate: 0.24 },
          { date: "2026-03-14", clinicType: "urgent_care", complaint: "dizziness", accuracy: 0.78, overrideRate: 0.19, escalationRate: 0.22 },
          { date: "2026-03-15", clinicType: "urgent_care", complaint: "dizziness", accuracy: 0.80, overrideRate: 0.17, escalationRate: 0.20 },
          { date: "2026-03-16", clinicType: "urgent_care", complaint: "dizziness", accuracy: 0.83, overrideRate: 0.15, escalationRate: 0.18 },
          { date: "2026-03-17", clinicType: "urgent_care", complaint: "dizziness", accuracy: 0.85, overrideRate: 0.13, escalationRate: 0.16 },
          { date: "2026-03-18", clinicType: "urgent_care", complaint: "dizziness", accuracy: 0.87, overrideRate: 0.12, escalationRate: 0.14 },
        ],
      }),
    })
      .then((r) => r.json())
      .then(setRows);
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Target className="h-5 w-5" /> Benchmark Trends
      </h2>
      <Card>
        <CardContent className="pt-6">
          <div className="h-72" data-testid="chart-benchmark-trends">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="accuracyPct" name="Accuracy %" stroke="#2563eb" strokeWidth={2} />
                <Line type="monotone" dataKey="overrideRatePct" name="Override Rate %" stroke="#f97316" strokeWidth={2} />
                <Line type="monotone" dataKey="escalationRatePct" name="Escalation Rate %" stroke="#ef4444" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
