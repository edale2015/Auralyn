export default function SlaBadge({
  label,
  level,
}: {
  label: string
  level: "good" | "warning" | "danger" | "neutral"
}) {
  const cls =
    level === "good"
      ? "bg-green-100 text-green-700"
      : level === "warning"
      ? "bg-amber-100 text-amber-700"
      : level === "danger"
      ? "bg-red-100 text-red-700"
      : "bg-gray-100 text-gray-700"

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  )
}
