interface TierBadgeProps {
  tier: 1 | 2 | 3;
  label: string;
  compact?: boolean;
}

const TIER_STYLES: Record<number, string> = {
  1: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  2: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  3: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const TIER_DOTS: Record<number, string> = {
  1: "bg-emerald-500",
  2: "bg-amber-500",
  3: "bg-red-500 animate-pulse",
};

export function TierBadge({ tier, label, compact = false }: TierBadgeProps) {
  return (
    <span
      data-testid={`tier-badge-${tier}`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_STYLES[tier]}`}
    >
      <span className={`inline-block rounded-full ${compact ? "h-1.5 w-1.5" : "h-2 w-2"} ${TIER_DOTS[tier]}`} />
      {!compact && <span>T{tier}</span>}
      <span>{label}</span>
    </span>
  );
}
