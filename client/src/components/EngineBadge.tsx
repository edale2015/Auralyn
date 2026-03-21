type Props = {
  status: "active" | "degraded" | "stub";
};

export default function EngineBadge({ status }: Props) {
  const styles: Record<Props["status"], string> = {
    active: "bg-green-100 text-green-700",
    degraded: "bg-yellow-100 text-yellow-700",
    stub: "bg-gray-100 text-gray-500",
  };

  const labels: Record<Props["status"], string> = {
    active: "active",
    degraded: "degraded",
    stub: "stub",
  };

  return (
    <span
      className={`px-2 py-1 rounded text-xs font-medium ${styles[status]}`}
      data-testid={`engine-badge-${status}`}
    >
      {labels[status]}
    </span>
  );
}
