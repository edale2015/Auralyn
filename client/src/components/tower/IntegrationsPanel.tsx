import { useQuery } from "@tanstack/react-query";
import { Database, Brain, Zap, MessageCircle, FileText, Activity, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Integration { name: string; status: "ok" | "warn" | "error" | "pending"; icon: string; }

const ICON_MAP: Record<string, any> = {
  database: Database, brain: Brain, zap: Zap,
  "message-circle": MessageCircle, "file-text": FileText,
  activity: Activity, phone: Phone,
};

const STATUS_STYLE: Record<string, string> = {
  ok:      "bg-green-100 text-green-800 border-green-300",
  warn:    "bg-yellow-100 text-yellow-800 border-yellow-300",
  error:   "bg-red-100 text-red-800 border-red-300",
  pending: "bg-gray-100 text-gray-600 border-gray-300",
};

export default function IntegrationsPanel() {
  const { data: integrations = [] } = useQuery<Integration[]>({
    queryKey: ["/api/sysctrl/integrations"],
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-1.5" data-testid="integrations-panel">
      {integrations.map((intg, i) => {
        const Icon = ICON_MAP[intg.icon] ?? Activity;
        return (
          <div key={i} className="flex items-center justify-between p-2 rounded-lg border bg-card text-xs" data-testid={`integration-row-${i}`}>
            <div className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium">{intg.name}</span>
            </div>
            <Badge className={`text-xs py-0 border ${STATUS_STYLE[intg.status]}`}>
              {intg.status}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
