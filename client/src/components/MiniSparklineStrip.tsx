import { cn } from "@/lib/utils"

export default function MiniSparklineStrip({
  values,
  label,
  color = "bg-blue-500",
  height = 32,
}: {
  values: number[]
  label?: string
  color?: string
  height?: number
}) {
  if (values.length === 0) {
    return <div className="text-xs text-muted-foreground italic">No data</div>
  }

  const max = Math.max(...values, 1)
  const barWidth = Math.max(4, Math.floor(200 / values.length) - 1)

  return (
    <div>
      {label && <p className="text-[10px] text-muted-foreground mb-1">{label}</p>}
      <div className="flex items-end gap-px" style={{ height }}>
        {values.map((v, i) => {
          const h = Math.max(2, Math.round((v / max) * height))
          return (
            <div
              key={i}
              title={String(v)}
              className={cn("rounded-sm opacity-80", color)}
              style={{ width: barWidth, height: h }}
            />
          )
        })}
      </div>
    </div>
  )
}
