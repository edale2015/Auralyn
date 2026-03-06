import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Row = {
  complaintId: string;
  caseCount: number;
  redFlagCaseCount: number;
  signedOffCount: number;
  overrideCount: number;
  disagreementCount: number;
};

type Props = {
  rows: Row[];
};

export function ComplaintMetricsChart({ rows }: Props) {
  const data = rows.slice(0, 12).map((r) => ({
    complaintId: r.complaintId,
    cases: r.caseCount,
    redFlags: r.redFlagCaseCount,
    overrides: r.overrideCount,
    disagreements: r.disagreementCount
  }));

  return (
    <Card data-testid="chart-complaint-metrics">
      <CardHeader>
        <CardTitle className="text-base">Complaint Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="complaintId" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="cases" fill="hsl(var(--primary))" />
              <Bar dataKey="redFlags" fill="#ef4444" />
              <Bar dataKey="overrides" fill="#f59e0b" />
              <Bar dataKey="disagreements" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
