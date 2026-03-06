import { Link } from "wouter";
import { DiscrepancyBadge } from "./DiscrepancyBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

type Row = {
  caseId: string;
  complaintId: string;
  complaintLabel?: string;
  discrepancyType: string;
  engineDisposition?: string;
  finalDisposition?: string;
  reviewerId?: string;
  createdAt?: string;
};

type Props = {
  rows: Row[];
};

export function TopDisagreementTable({ rows }: Props) {
  return (
    <Card data-testid="table-top-disagreements">
      <CardHeader>
        <CardTitle className="text-base">Top Disagreements</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground" data-testid="text-no-disagreements">
            No disagreements found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case</TableHead>
                <TableHead>Complaint</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Engine</TableHead>
                <TableHead>Final</TableHead>
                <TableHead>Reviewer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.caseId} data-testid={`row-disagreement-${r.caseId}`}>
                  <TableCell>
                    <Link href={`/review/${r.caseId}`} data-testid={`link-case-${r.caseId}`}>
                      <span className="text-foreground underline cursor-pointer text-xs font-mono">
                        {r.caseId.slice(0, 12)}...
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.complaintLabel || r.complaintId}
                  </TableCell>
                  <TableCell>
                    <DiscrepancyBadge type={r.discrepancyType} />
                  </TableCell>
                  <TableCell className="text-xs">{r.engineDisposition || "—"}</TableCell>
                  <TableCell className="text-xs">{r.finalDisposition || "—"}</TableCell>
                  <TableCell className="text-xs">{r.reviewerId || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
