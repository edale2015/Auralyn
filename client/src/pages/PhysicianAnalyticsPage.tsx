import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, BarChart2, Users, Clock, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";

interface ReviewerStats {
  id: string;
  name: string;
  total: number;
  approvals: number;
  modifications: number;
  escalations: number;
  rejections: number;
  overrideRate: number;
  avgResponseMs: number | null;
}

interface AnalyticsData {
  totalCases: number;
  reviewedCases: number;
  avgResponseMs: number | null;
  overallOverrideRate: number;
  volumeByStatus: { status: string; count: number }[];
  reviewers: ReviewerStats[];
  overrides: { original: string; override: string; count: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  APPROVED: "#22c55e",
  MODIFIED: "#f97316",
  ESCALATED: "#eab308",
  REJECTED: "#ef4444",
  UNREVIEWED: "#94a3b8",
};

function msToHuman(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs uppercase tracking-wide font-medium">{label}</span>
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function PhysicianAnalyticsPage() {
  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["/api/physician-analytics"],
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]" data-testid="text-loading">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="text-destructive text-sm" data-testid="text-error">
          Failed to load physician analytics. {error ? String(error) : ""}
        </div>
      </div>
    );
  }

  const coverageRate = data.totalCases > 0
    ? `${((data.reviewedCases / data.totalCases) * 100).toFixed(1)}%`
    : "—";

  return (
    <div className="p-6 space-y-6" data-testid="page-physician-analytics">
      <div className="flex items-center gap-3">
        <BarChart2 className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Physician Response-Time Analytics</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Reviewed Cases"
          value={`${data.reviewedCases} / ${data.totalCases}`}
          sub={`${coverageRate} coverage`}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Avg Response Time"
          value={msToHuman(data.avgResponseMs)}
          sub="creation → physician review"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Overall Override Rate"
          value={`${data.overallOverrideRate}%`}
          sub="cases modified or rejected"
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Active Reviewers"
          value={String(data.reviewers.length)}
          sub="physicians with reviews"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Review Outcomes Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {data.volumeByStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground">No review data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={data.volumeByStatus}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    outerRadius={75}
                    label={({ status, count }) => count > 0 ? `${status}: ${count}` : ""}
                    labelLine={false}
                  >
                    {data.volumeByStatus.map((entry, i) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.status] || "#6b7280"} />
                    ))}
                  </Pie>
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Disposition Override Patterns</CardTitle>
          </CardHeader>
          <CardContent>
            {data.overrides.length === 0 ? (
              <p className="text-sm text-muted-foreground">No disposition overrides recorded yet.</p>
            ) : (
              <div className="space-y-1.5">
                {data.overrides.slice(0, 8).map((o, i) => (
                  <div key={i} className="flex items-center justify-between text-xs" data-testid={`row-override-${i}`}>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-xs font-mono">{o.original}</Badge>
                      <span className="text-muted-foreground">→</span>
                      <Badge variant="outline" className="text-xs font-mono">{o.override}</Badge>
                    </div>
                    <span className="font-semibold tabular-nums">{o.count}×</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {data.reviewers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Reviewer Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Physician</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Approved</TableHead>
                    <TableHead className="text-right">Modified</TableHead>
                    <TableHead className="text-right">Escalated</TableHead>
                    <TableHead className="text-right">Rejected</TableHead>
                    <TableHead className="text-right">Override Rate</TableHead>
                    <TableHead className="text-right">Avg Response</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.reviewers.map((r) => (
                    <TableRow key={r.id} data-testid={`row-reviewer-${r.id}`}>
                      <TableCell className="font-medium text-sm">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                      <TableCell className="text-right text-green-600 tabular-nums">{r.approvals}</TableCell>
                      <TableCell className="text-right text-orange-500 tabular-nums">{r.modifications}</TableCell>
                      <TableCell className="text-right text-yellow-500 tabular-nums">{r.escalations}</TableCell>
                      <TableCell className="text-right text-destructive tabular-nums">{r.rejections}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={r.overrideRate > 30 ? "destructive" : r.overrideRate > 15 ? "secondary" : "outline"} className="text-xs">
                          {r.overrideRate}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                        {msToHuman(r.avgResponseMs)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {data.reviewers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Reviews per Physician</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.reviewers} barCategoryGap="25%">
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartsTooltip />
                <Bar dataKey="approvals" name="Approved" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                <Bar dataKey="modifications" name="Modified" stackId="a" fill="#f97316" />
                <Bar dataKey="escalations" name="Escalated" stackId="a" fill="#eab308" />
                <Bar dataKey="rejections" name="Rejected" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
