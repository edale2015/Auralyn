import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  Shield,
} from "lucide-react";
import { CaseTypePill } from "@/components/CaseTypePill";

export interface CaseSnapshot {
  caseId: string;
  complaintId: string;
  complaintLabel?: string;
  status: string;
  reviewStatus: string;
  recommendedDisposition?: string;
  confidence?: string;
  winningClusterId?: string;
  triggeredRedFlagCount: number;
  dxCandidateCount: number;
  answeredQuestionCount: number;
  sourceChannel?: string;
  assignedReviewerId?: string;
  createdAt?: string;
  updatedAt?: string;
  patientName?: string;
  caseType?: string;
  caseTypePending?: boolean;
  caseTypeMeta?: {
    label:     string;
    asyncSafe: boolean;
    color:     string;
    priority:  number;
  };
  uncertaintyFlag?:  string;
  uncertaintyLabel?: string;
  uncertaintyColor?: "green" | "yellow" | "orange" | "red";
  reviewPriority?:   "routine" | "elevated" | "urgent";
}

type Props = {
  snapshot: CaseSnapshot;
  showOpenLink?: boolean;
};

function dispositionBadgeVariant(disp?: string): "default" | "secondary" | "destructive" | "outline" {
  if (!disp) return "outline";
  const d = disp.toLowerCase();
  if (d === "er_send") return "destructive";
  if (d === "urgent_care" || d === "routine_urgent") return "default";
  return "secondary";
}

function confidenceIcon(conf?: string) {
  if (!conf) return null;
  const c = conf.toUpperCase();
  if (c === "HIGH") return <CheckCircle className="h-3.5 w-3.5 text-green-600" />;
  if (c === "MODERATE") return <Shield className="h-3.5 w-3.5 text-amber-500" />;
  return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
}

export function CaseSnapshotCard({ snapshot, showOpenLink = true }: Props) {
  const timeAgo = snapshot.updatedAt
    ? new Date(snapshot.updatedAt).toLocaleString()
    : "";

  return (
    <Card className="mb-3" data-testid={`snapshot-card-${snapshot.caseId}`}>
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm">
              {snapshot.complaintLabel || snapshot.complaintId}
            </span>
            {snapshot.patientName && (
              <span className="text-xs text-muted-foreground">
                — {snapshot.patientName}
              </span>
            )}
            <CaseTypePill
              label={snapshot.caseType}
              pending={snapshot.caseTypePending}
              color={snapshot.caseTypeMeta?.color}
            />
          </div>
          {showOpenLink && (
            <Link href={`/review/${snapshot.caseId}`}>
              <span className="text-xs text-primary hover:underline cursor-pointer" data-testid={`snapshot-open-${snapshot.caseId}`}>
                Open
              </span>
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={dispositionBadgeVariant(snapshot.recommendedDisposition)}
            data-testid={`snapshot-disposition-${snapshot.caseId}`}
          >
            {snapshot.recommendedDisposition || "PENDING"}
          </Badge>

          {snapshot.confidence && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {confidenceIcon(snapshot.confidence)}
              {snapshot.confidence}
            </span>
          )}

          {snapshot.triggeredRedFlagCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {snapshot.triggeredRedFlagCount} red flag{snapshot.triggeredRedFlagCount > 1 ? "s" : ""}
            </Badge>
          )}

          {snapshot.uncertaintyLabel && (
            <span
              data-testid={`uncertainty-badge-${snapshot.caseId}`}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                snapshot.uncertaintyColor === "red"    ? "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-700" :
                snapshot.uncertaintyColor === "orange" ? "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-700" :
                snapshot.uncertaintyColor === "yellow" ? "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-700" :
                                                         "bg-green-100 text-green-800 border-green-300 dark:bg-green-950 dark:text-green-300 dark:border-green-700"
              }`}
            >
              {snapshot.uncertaintyLabel}
            </span>
          )}

          <span className="text-xs text-muted-foreground">
            {snapshot.answeredQuestionCount} answers
          </span>

          {snapshot.winningClusterId && (
            <span className="text-xs text-muted-foreground">
              {snapshot.winningClusterId}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {timeAgo}
          {snapshot.sourceChannel && (
            <span>· {snapshot.sourceChannel}</span>
          )}
          {snapshot.assignedReviewerId && (
            <span>· Reviewer: {snapshot.assignedReviewerId}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
