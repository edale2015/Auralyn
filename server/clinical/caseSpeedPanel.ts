export interface PhysicianSpeedSummary {
  complaint: string;
  topDx: string;
  risk: string;
  disposition: string;
}

export function buildPhysicianSummary(caseData: {
  complaint?: string;
  differential?: Array<{ diagnosis?: string; name?: string }>;
  risk?: string;
  disposition?: string;
  [key: string]: unknown;
}): PhysicianSpeedSummary {
  const topDx =
    caseData.differential?.[0]?.diagnosis ??
    caseData.differential?.[0]?.name ??
    "Unknown";

  return {
    complaint: caseData.complaint ?? "Unknown",
    topDx,
    risk: caseData.risk ?? "Unknown",
    disposition: caseData.disposition ?? "Unknown",
  };
}

export function dispositionFollowup(disposition: string): string {
  if (disposition === "ER_NOW") return "Immediate call";
  if (disposition === "URGENT") return "2-hour check";
  if (disposition === "SAME_DAY") return "4-hour check";
  if (disposition === "NEXT_DAY") return "Next-day call";
  return "24-hour follow-up";
}
