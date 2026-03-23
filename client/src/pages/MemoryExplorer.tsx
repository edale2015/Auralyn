import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, Search, Activity, Cpu, AlertTriangle, RefreshCw, ArrowRight } from "lucide-react";
import MemoryGraphView from "@/components/MemoryGraphView";
import { useToast } from "@/hooks/use-toast";

export default function MemoryExplorer() {
  const { toast } = useToast();
  const [searchComplaints, setSearchComplaints] = useState("");
  const [similarCases, setSimilarCases] = useState<any[]>([]);

  const { data: summaryData, isLoading, refetch } = useQuery({
    queryKey: ["/api/memory/summary"],
  });

  const { data: errorsData } = useQuery({ queryKey: ["/api/memory/errors"] });
  const { data: robotData } = useQuery({ queryKey: ["/api/memory/robot-actions"] });
  const { data: successData } = useQuery({ queryKey: ["/api/memory/success-rate"] });

  const searchMutation = useMutation({
    mutationFn: (complaints: string[]) =>
      apiRequest("POST", "/api/memory/similar-cases", { complaints }),
    onSuccess: (data: any) => setSimilarCases(data.cases ?? []),
    onError: () => toast({ title: "Search failed", variant: "destructive" }),
  });

  const summary = summaryData as any;
  const errors = (errorsData as any)?.errors ?? [];
  const robotActions = (robotData as any)?.actions ?? [];
  const successRate = successData as any;

  function handleSearch() {
    const complaints = searchComplaints.split(",").map(s => s.trim()).filter(Boolean);
    if (!complaints.length) return;
    searchMutation.mutate(complaints);
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Brain className="w-5 h-5 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Memory Explorer</h1>
            <p className="text-sm text-gray-500">Graph of patients, decisions, outcomes, and robot actions</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-memory">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <Card data-testid="card-total-nodes">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-indigo-700">{summary.stats?.nodeCount ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">Total Nodes</div>
            </CardContent>
          </Card>
          <Card data-testid="card-total-edges">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-purple-700">{summary.stats?.edgeCount ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">Total Edges</div>
            </CardContent>
          </Card>
          <Card data-testid="card-success-rate">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-700">
                {successRate ? `${Math.round(successRate.rate * 100)}%` : "—"}
              </div>
              <div className="text-xs text-gray-500 mt-1">Outcome Success Rate</div>
            </CardContent>
          </Card>
          <Card data-testid="card-error-count">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-700">{summary.recentErrorCount ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">Recent Errors</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="graph">
        <TabsList>
          <TabsTrigger value="graph" data-testid="tab-graph">Graph View</TabsTrigger>
          <TabsTrigger value="search" data-testid="tab-search">Similar Cases</TabsTrigger>
          <TabsTrigger value="errors" data-testid="tab-errors">Errors</TabsTrigger>
          <TabsTrigger value="robot" data-testid="tab-robot">Robot Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="graph">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Memory Graph Nodes</CardTitle>
            </CardHeader>
            <CardContent>
              <MemoryGraphView maxNodes={50} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="w-4 h-4 text-indigo-600" /> Find Similar Cases
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="ear_pain, fever, cough (comma-separated)"
                  value={searchComplaints}
                  onChange={e => setSearchComplaints(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  data-testid="input-complaint-search"
                />
                <Button onClick={handleSearch} disabled={searchMutation.isPending}
                  data-testid="button-search-cases">
                  <Search className="w-4 h-4 mr-2" />
                  {searchMutation.isPending ? "Searching…" : "Search"}
                </Button>
              </div>

              {similarCases.length > 0 && (
                <div className="space-y-2" data-testid="similar-cases-list">
                  {similarCases.map((c: any) => (
                    <div key={c.id} className="border rounded-xl p-3 bg-white flex items-start justify-between">
                      <div>
                        <div className="text-sm font-medium">{c.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {c.data?.patientId} • Risk: {((c.data?.riskScore ?? 0) * 100).toFixed(0)}%
                        </div>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {c.data?.complaints?.map((comp: string) => (
                            <span key={comp} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                              {comp}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Badge variant="outline" className="capitalize">{c.data?.triage}</Badge>
                    </div>
                  ))}
                </div>
              )}
              {similarCases.length === 0 && searchMutation.isSuccess && (
                <div className="text-sm text-gray-400 text-center py-4">No matching cases in memory.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" /> Recent Errors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2" data-testid="error-list">
                {errors.map((e: any) => (
                  <div key={e.id} className="border rounded-lg p-3 bg-white">
                    <div className="text-sm font-medium text-red-700">{e.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{e.data?.message}</div>
                    <div className="text-xs text-gray-400 mt-1">{new Date(e.createdAt).toLocaleString()}</div>
                  </div>
                ))}
                {errors.length === 0 && (
                  <div className="text-sm text-gray-400 text-center py-4">No errors recorded.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="robot">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-600" /> Robot Action Log
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2" data-testid="robot-action-list">
                {robotActions.map((a: any) => (
                  <div key={a.id} className="border rounded-lg p-3 bg-white flex items-center gap-3">
                    <Cpu className="w-4 h-4 text-indigo-500 shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{a.data?.action}</div>
                      <div className="text-xs text-gray-400">{a.data?.patientId} • {new Date(a.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
                {robotActions.length === 0 && (
                  <div className="text-sm text-gray-400 text-center py-4">No robot actions logged yet.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
