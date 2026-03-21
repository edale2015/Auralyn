type Props = {
  title: string;
  value: string | number;
  subtitle?: string;
  status?: "ok" | "fail" | "warn" | "neutral";
};

export default function StatCard({ title, value, subtitle, status = "neutral" }: Props) {
  const valueColor =
    status === "ok"
      ? "text-green-600"
      : status === "fail"
      ? "text-red-600"
      : status === "warn"
      ? "text-amber-600"
      : "text-gray-900";

  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-white dark:bg-gray-900 dark:border-gray-700">
      <div className="text-sm text-gray-500 dark:text-gray-400">{title}</div>
      <div className={`text-2xl font-semibold mt-1 ${valueColor}`}>{value}</div>
      {subtitle ? <div className="text-xs text-gray-400 mt-1">{subtitle}</div> : null}
    </div>
  );
}
