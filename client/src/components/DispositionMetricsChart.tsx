import {
  PieChart,
  Pie,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Row = {
  disposition: string;
  count: number;
};

type Props = {
  rows: Row[];
};

const COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff8042", "#8dd1e1", "#d0ed57"];

export function DispositionMetricsChart({ rows }: Props) {
  const data = rows.map((r) => ({
    name: r.disposition,
    value: r.count
  }));

  return (
    <Card data-testid="chart-disposition-metrics">
      <CardHeader>
        <CardTitle className="text-base">Disposition Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" outerRadius={100} label>
                {data.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
