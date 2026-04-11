import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CommunicationControlTower() {
  const { data: traces = [], isLoading } = useQuery({
    queryKey: ["/api/communication-advanced/traces"],
    queryFn: async () => {
      const res = await fetch("/api/communication-advanced/traces");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: bestVariantData } = useQuery({
    queryKey: ["/api/communication-advanced/best-variant"],
    queryFn: async () => {
      const res = await fetch("/api/communication-advanced/best-variant");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const decisionColor = {
    NO_ANTIBIOTIC: "bg-green-100 text-green-800",
    DELAYED_RX: "bg-yellow-100 text-yellow-800",
    ANTIBIOTIC_GIVEN: "bg-red-100 text-red-800",
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto" data-testid="communication-control-tower">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Communication Control Tower</h1>
        {bestVariantData?.bestVariant && (
          <div className="text-sm text-gray-600">
            Best performing variant: <span className="font-medium">{bestVariantData.bestVariant}</span>
          </div>
        )}
      </div>

      {bestVariantData?.ranking?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Variant Performance Ranking</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {bestVariantData.ranking.map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between" data-testid={`variant-rank-${i}`}>
                  <span className="text-sm text-gray-700">{item.variant}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${Math.min(100, (item.weight / 2) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-8">{item.weight.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">Decision Trace Log</h2>

        {isLoading && (
          <div className="text-sm text-gray-500">Loading traces...</div>
        )}

        {!isLoading && traces.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-gray-500 text-sm">
              No communication traces yet. Generate scripts via the Communication Dashboard to see decisions here.
            </CardContent>
          </Card>
        )}

        {traces.map((trace: any, i: number) => (
          <Card key={i} data-testid={`trace-card-${i}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm">
                    <span className="text-gray-500">Patient: </span>
                    <span className="font-medium">{trace.patientId}</span>
                    <span className="mx-2 text-gray-300">·</span>
                    <span className="text-gray-500">Complaint: </span>
                    <span className="font-medium">{trace.complaint || "—"}</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {trace.timestamp ? new Date(trace.timestamp).toLocaleString() : ""}
                  </div>
                </div>
                <Badge
                  className={`shrink-0 ${decisionColor[trace.decision as keyof typeof decisionColor] ?? "bg-gray-100 text-gray-700"}`}
                  data-testid={`decision-badge-${i}`}
                >
                  {trace.decision?.replace(/_/g, " ")}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-gray-500 text-xs">Tone</span>
                  <div className="font-medium capitalize">{trace.tone}</div>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">Script variant</span>
                  <div className="font-medium">{trace.scriptVariant}</div>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">Visit count</span>
                  <div className="font-medium">{trace.visitCount}</div>
                </div>
              </div>

              {trace.reasoning?.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">Reasoning</div>
                  <ul className="list-disc pl-4 text-xs text-gray-600 space-y-0.5">
                    {trace.reasoning.map((r: string, j: number) => (
                      <li key={j}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
