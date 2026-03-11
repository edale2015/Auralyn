type Props = {
  disposition?: string;
};

function getTone(disposition?: string) {
  switch (disposition) {
    case "er_now":
    case "er_send":
      return "bg-red-100 text-red-800 border-red-300";
    case "urgent_same_day":
    case "urgent_care":
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "routine_evaluation":
    case "routine":
      return "bg-green-100 text-green-800 border-green-300";
    case "self_care":
      return "bg-blue-100 text-blue-800 border-blue-300";
    default:
      return "bg-slate-100 text-slate-700 border-slate-300";
  }
}

export default function DispositionBadge({ disposition }: Props) {
  return (
    <span
      data-testid="disposition-badge"
      className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${getTone(disposition)}`}
    >
      {disposition ? disposition.replace(/_/g, " ") : "unknown"}
    </span>
  );
}
