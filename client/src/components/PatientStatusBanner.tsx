import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { AlertTriangle, CheckCircle, Shield } from "lucide-react";

type Explanation = {
  headline: string;
  body: string;
  urgency: "low" | "moderate" | "high";
};

type Props = {
  caseId: string;
};

const urgencyConfig = {
  high: {
    border: "border-red-400",
    bg: "bg-red-50 dark:bg-red-950",
    text: "text-red-800 dark:text-red-200",
    icon: AlertTriangle,
    iconColor: "text-red-600",
  },
  moderate: {
    border: "border-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950",
    text: "text-amber-800 dark:text-amber-200",
    icon: Shield,
    iconColor: "text-amber-600",
  },
  low: {
    border: "border-green-400",
    bg: "bg-green-50 dark:bg-green-950",
    text: "text-green-800 dark:text-green-200",
    icon: CheckCircle,
    iconColor: "text-green-600",
  },
};

export function PatientStatusBanner({ caseId }: Props) {
  const { authFetch } = useAuth();
  const [data, setData] = useState<Explanation | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setError("");
        const res = await authFetch(`/api/chatDispositionExplanation/${caseId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load explanation");
        setData(json);
      } catch (err: any) {
        setError(err?.message ?? "Failed to load status");
      }
    }
    load();
  }, [caseId]);

  if (error) {
    return (
      <div className="text-sm text-destructive" data-testid={`patient-status-error-${caseId}`}>
        {error}
      </div>
    );
  }

  if (!data) return null;

  const cfg = urgencyConfig[data.urgency] || urgencyConfig.low;
  const Icon = cfg.icon;

  return (
    <div
      className={`rounded-lg border p-3 flex items-start gap-3 ${cfg.border} ${cfg.bg} ${cfg.text}`}
      data-testid={`patient-status-banner-${caseId}`}
    >
      <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${cfg.iconColor}`} />
      <div>
        <div className="font-semibold text-sm" data-testid={`patient-status-headline-${caseId}`}>
          {data.headline}
        </div>
        <div className="text-sm mt-0.5 opacity-90" data-testid={`patient-status-body-${caseId}`}>
          {data.body}
        </div>
      </div>
    </div>
  );
}
