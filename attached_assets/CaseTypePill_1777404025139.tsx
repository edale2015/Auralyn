/**
 * CaseTypePill.tsx
 * Drop into: client/src/components/CaseTypePill.tsx
 *
 * Renders the caseType label pill on each CaseSnapshotCard.
 * Shows a pulsing skeleton when caseType is pending (not yet classified).
 *
 * Usage in CaseSnapshotCard:
 *   <CaseTypePill label={c.caseType} pending={c.caseTypePending} />
 */

import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

interface CaseTypePillProps {
  /** The caseType label string e.g. "Async Safe", "Urgent Sync Required" */
  label?:   string;
  /** True while the classifier is running — shows pulsing skeleton */
  pending?: boolean;
  /** Optional: pass Tailwind color classes from caseTypeMeta.color */
  color?:   string;
}

// Fallback color map for when caseTypeMeta.color isn't available client-side
const LABEL_COLOR: Record<string, string> = {
  "Async Safe":             "bg-green-100 text-green-800 border-green-300",
  "Routine Primary Care":   "bg-gray-100 text-gray-700 border-gray-300",
  "Chronic Follow-up":      "bg-blue-100 text-blue-800 border-blue-300",
  "Pediatric Urgent":       "bg-purple-100 text-purple-800 border-purple-300",
  "High-Risk ED Diversion": "bg-red-100 text-red-800 border-red-300",
  "Urgent Sync Required":   "bg-orange-100 text-orange-800 border-orange-300",
  "Sync Review":            "bg-yellow-100 text-yellow-800 border-yellow-300",
};

export function CaseTypePill({ label, pending, color }: CaseTypePillProps) {
  // Pending state — pulsing skeleton
  if (pending || (!label && !pending === false)) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] bg-gray-100 border-gray-200 text-gray-400 animate-pulse"
        data-testid="case-type-pill-pending"
      >
        <Clock className="h-2.5 w-2.5" />
        Classifying…
      </span>
    );
  }

  // No label — render nothing (classifier not yet called)
  if (!label) return null;

  const colorClass = color ?? LABEL_COLOR[label] ?? "bg-gray-100 text-gray-700 border-gray-300";

  // Async Safe gets a special indicator to make it visually distinct
  const isAsync = label === "Async Safe";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${colorClass}`}
      data-testid="case-type-pill"
      title={isAsync ? "Safe for asynchronous physician review" : `Case type: ${label}`}
    >
      {isAsync && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
      )}
      {label}
    </span>
  );
}
