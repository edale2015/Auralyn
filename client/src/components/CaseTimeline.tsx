import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Loader2 } from "lucide-react";

type Props = {
  caseId: string;
};

interface TimelineEntry {
  id: string;
  kind: "event" | "signoff";
  createdAt: string;
  data: any;
}

function mergeTimeline(events: any[], signoffs: any[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const e of events) {
    entries.push({ id: e.eventId, kind: "event", createdAt: e.createdAt, data: e });
  }

  for (const s of signoffs) {
    entries.push({ id: s.signoffId, kind: "signoff", createdAt: s.createdAt, data: s });
  }

  entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return entries;
}

export function CaseTimeline({ caseId }: Props) {
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/discrepancies", caseId, "timeline"],
    queryFn: async () => {
      const res = await fetch(`/api/discrepancies/${caseId}/timeline`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!caseId,
  });

  if (isLoading) {
    return (
      <Card data-testid="panel-case-timeline">
        <CardContent className="pt-4 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card data-testid="panel-case-timeline">
        <CardContent className="pt-4 text-sm text-muted-foreground" data-testid="text-timeline-error">
          {error ? String(error) : "No timeline data."}
        </CardContent>
      </Card>
    );
  }

  const timeline = mergeTimeline(data.events ?? [], data.signoffs ?? []);

  return (
    <Card data-testid="panel-case-timeline">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2" data-testid="text-timeline-title">
          <Clock className="h-4 w-4" />
          Case Timeline
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0">
        {timeline.length === 0 && (
          <div className="text-sm text-muted-foreground" data-testid="text-timeline-empty">
            No timeline entries.
          </div>
        )}

        {timeline.map((entry) =>
          entry.kind === "event" ? (
            <div
              key={entry.id}
              className="border-l-2 border-muted-foreground/20 pl-3 pb-4 last:pb-0"
              data-testid={`timeline-event-${entry.id}`}
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span data-testid="text-event-time">{entry.data.createdAt}</span>
                <Badge variant="outline" className="text-[10px]" data-testid="badge-event-type">
                  {entry.data.type}
                </Badge>
              </div>
              <div className="text-sm mt-0.5" data-testid="text-event-summary">{entry.data.summary}</div>
              {entry.data.payload && (
                <pre className="bg-muted rounded p-2 text-[10px] mt-1 overflow-auto max-h-24" data-testid="text-event-payload">
                  {JSON.stringify(entry.data.payload, null, 2)}
                </pre>
              )}
            </div>
          ) : (
            <div
              key={entry.id}
              className="border-l-2 border-primary/40 pl-3 pb-4 last:pb-0"
              data-testid={`timeline-signoff-${entry.id}`}
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span data-testid="text-signoff-time">{entry.data.createdAt}</span>
                <Badge variant="outline" className="text-[10px]" data-testid="badge-signoff-label">
                  SIGNOFF
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge
                  variant={entry.data.status === "APPROVED" ? "default" : "secondary"}
                  data-testid="badge-signoff-status"
                >
                  {entry.data.status}
                </Badge>
                <span className="text-xs text-muted-foreground" data-testid="text-signoff-reviewer">
                  by {entry.data.reviewerName || entry.data.reviewerId}
                </span>
              </div>
              {entry.data.rationale && (
                <div className="text-xs mt-0.5" data-testid="text-signoff-rationale">
                  {entry.data.rationale}
                </div>
              )}
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
