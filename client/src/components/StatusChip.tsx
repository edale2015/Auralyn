import { cn } from "@/lib/utils"

export type StatusLevel = "success" | "warning" | "error" | "info" | "neutral"

const LEVEL_CLASSES: Record<StatusLevel, string> = {
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-700",
  neutral: "bg-gray-100 text-gray-600",
}

export default function StatusChip({
  label,
  level = "neutral",
  dot = true,
  className,
}: {
  label: string
  level?: StatusLevel
  dot?: boolean
  className?: string
}) {
  const dotColors: Record<StatusLevel, string> = {
    success: "bg-green-500",
    warning: "bg-amber-500",
    error: "bg-red-500",
    info: "bg-blue-500",
    neutral: "bg-gray-400",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        LEVEL_CLASSES[level],
        className
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotColors[level])} />}
      {label}
    </span>
  )
}
