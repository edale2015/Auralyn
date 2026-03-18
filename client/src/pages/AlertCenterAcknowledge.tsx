import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, ChevronLeft, ChevronRight, CheckCircle } from "lucide-react";

type Props = {
  token: string;
};

export default function AlertCenterAcknowledge({ token }: Props) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);

  const load = async (nextPage: number) => {
    const res = await fetch(
      `/api/executive-ops/alerts-workflow?page=${nextPage}&pageSize=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const json = await res.json();
    setData(Array.isArray(json) ? { items: json, page: nextPage, totalPages: 1 } : json);
    setPage(nextPage);
  };

  useEffect(() => {
    load(1);
  }, []);

  if (!data) return <div className="text-muted-foreground">Loading alerts...</div>;

  const items = data.items || data || [];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Bell className="h-5 w-5" /> Alerts
      </h2>

      {items.map((alert: any) => (
        <Card key={alert.id}>
          <CardContent className="pt-6 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">
                {alert.type} | {alert.entityId}
              </span>
              <Badge
                variant={
                  alert.severity === "critical"
                    ? "destructive"
                    : alert.severity === "warning"
                    ? "secondary"
                    : "default"
                }
              >
                {alert.severity}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{alert.message}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Acknowledged: {String(alert.acknowledged ?? false)}
              </span>
              {!alert.acknowledged && (
                <Button
                  data-testid={`button-acknowledge-alert-${alert.id}`}
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await fetch(
                      `/api/executive-ops/alerts-workflow/${alert.id}/acknowledge`,
                      {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}` },
                      }
                    );
                    load(page);
                  }}
                >
                  <CheckCircle className="h-3 w-3 mr-1" /> Acknowledge
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {data.totalPages > 1 && (
        <div className="flex gap-2 items-center justify-center">
          <Button
            data-testid="button-alerts-prev"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => load(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.page} / {data.totalPages}
          </span>
          <Button
            data-testid="button-alerts-next"
            variant="outline"
            size="sm"
            disabled={page >= data.totalPages}
            onClick={() => load(page + 1)}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
