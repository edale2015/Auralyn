import { listCompareDiffs } from "./compareDiffStore";

export async function exploreCompareDiffs(params: {
  limit?: number;
  complaint?: string;
  sameDisposition?: boolean;
  sameComplaint?: boolean;
}) {
  const rows = await listCompareDiffs(params.limit ?? 200);

  return rows.filter((row: any) => {
    if (params.complaint) {
      const complaint = params.complaint.toLowerCase();
      const seqComplaint = String(row.sequential?.complaint ?? "").toLowerCase();
      const graphComplaint = String(row.graph?.complaint ?? "").toLowerCase();
      if (!seqComplaint.includes(complaint) && !graphComplaint.includes(complaint)) {
        return false;
      }
    }

    if (typeof params.sameDisposition === "boolean") {
      if (Boolean(row.sameDisposition) !== params.sameDisposition) return false;
    }

    if (typeof params.sameComplaint === "boolean") {
      if (Boolean(row.sameComplaint) !== params.sameComplaint) return false;
    }

    return true;
  });
}
