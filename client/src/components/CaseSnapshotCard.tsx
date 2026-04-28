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
