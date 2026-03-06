import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TraceEntry {
  table: string;
  ruleId: string;
  fired: boolean;
  [key: string]: any;
}

export function RuleTracePanel({ trace }: { trace?: TraceEntry[] }) {
  if (!trace || trace.length === 0) return null;

  return (
    <Card data-testid="panel-rule-trace">
      <CardHeader>
        <CardTitle className="text-base">Rule Trace</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 text-xs font-mono">
          {trace.map((r, i) => (
            <div key={i} className="flex items-center gap-2" data-testid={`trace-entry-${i}`}>
              <Badge variant="outline" className="text-[10px]">{r.table}</Badge>
              <span>{r.ruleId}</span>
              <Badge variant={r.fired ? "default" : "secondary"}>
                {r.fired ? "fired" : "skipped"}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
