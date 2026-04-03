import { useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface HealthDot {
  key: string;
  label: string;
  status: "green" | "amber" | "red" | "gray";
  detail: string;
  degradedMessage?: string;
}

interface AmbientHealthSnapshot {
  dots: HealthDot[];
  overallStatus: "green" | "amber" | "red" | "gray";
  hasAlert: boolean;
  snapshottedAt: string;
}

const DOT_COLORS: Record<string, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-400 animate-pulse",
  red: "bg-red-500 animate-pulse",
  gray: "bg-slate-400",
};

const DOT_RING: Record<string, string> = {
  green: "ring-emerald-200",
  amber: "ring-amber-200",
  red: "ring-red-200",
  gray: "ring-slate-200",
};

export function AmbientHealthBar() {
  const { data, isLoading } = useQuery<AmbientHealthSnapshot>({
    queryKey: ["/api/command-strip/health"],
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-3 w-3 rounded-full bg-slate-300 dark:bg-slate-600 animate-pulse" />
        ))}
      </div>
    );
  }

  const dots = data?.dots ?? [];

  return (
    <TooltipProvider delayDuration={200}>
      <div
        data-testid="ambient-health-bar"
        className="flex items-center gap-3 px-4 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50"
      >
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">System</span>
        <div className="flex items-center gap-2">
          {dots.map(dot => (
            <Tooltip key={dot.key}>
              <TooltipTrigger asChild>
                <button
                  data-testid={`health-dot-${dot.key}`}
                  className={`h-3 w-3 rounded-full ring-2 ring-offset-1 transition-all ${DOT_COLORS[dot.status]} ${DOT_RING[dot.status]}`}
                  aria-label={`${dot.label}: ${dot.status}`}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-semibold">{dot.label}</p>
                <p className="text-xs opacity-80">{dot.detail}</p>
                {dot.degradedMessage && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{dot.degradedMessage}</p>
                )}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        {data?.hasAlert && (
          <span className="ml-auto text-xs font-medium text-amber-600 dark:text-amber-400">
            System alert — hover dots for detail
          </span>
        )}
        <span className="text-xs text-slate-400 dark:text-slate-600 ml-auto">
          {data?.snapshottedAt ? new Date(data.snapshottedAt).toLocaleTimeString() : ""}
        </span>
      </div>
    </TooltipProvider>
  );
}
