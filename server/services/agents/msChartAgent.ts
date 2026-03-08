export interface ChartSection {
  title: string;
  content: string;
}

export function buildChartSections(caseData: any): ChartSection[] {
  const sections: ChartSection[] = [];

  sections.push({ title: "Chief Complaint", content: caseData?.complaintId || "Not specified" });

  const answers = caseData?.answers ?? {};
  const hpiParts = Object.entries(answers).map(([k, v]) => `${k}: ${v}`);
  sections.push({ title: "History of Present Illness", content: hpiParts.join("; ") || "No history recorded" });

  const engine = caseData?.engineResult;
  if (engine) {
    sections.push({ title: "Assessment", content: engine.recommendedDisposition || "Pending" });
    if (engine.dxCandidates?.length) {
      sections.push({ title: "Differential Diagnosis", content: engine.dxCandidates.map((d: any) => `${d.clusterId} (${d.score})`).join(", ") });
    }
    if (engine.triggeredRedFlags?.length) {
      sections.push({ title: "Red Flags", content: engine.triggeredRedFlags.join(", ") });
    }
  }

  return sections;
}
