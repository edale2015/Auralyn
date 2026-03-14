import { cn } from "@/lib/utils"

export type MetricItem = {
  label: string
  value: string | number
  trend?: "up" | "down" | "neutral"
  highlight?: boolean
}

export default function CompactMetricRow({ metrics }: { metrics: MetricItem[] }) {
  return (
    <div className="flex flex-wrap gap-4">
      {metrics.map((m) => (
        <div key={m.label} className="flex flex-col">
          <span className="text-xs text-muted-foreground">{m.label}</span>
          <span
            className={cn(
              "text-lg font-semibold",
              m.highlight && "text-blue-600",
              m.trend === "up" && "text-green-600",
              m.trend === "down" && "text-red-600"
            )}
          >
            {m.value}
          </span>
        </div>
      ))}
    </div>
  )
}
