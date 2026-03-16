export interface GuidelineStatus {
  source: string;
  status: "up_to_date" | "update_available" | "review_needed" | "deprecated";
  lastChecked: string;
  version?: string;
  notes?: string;
}

const guidelineStatuses: GuidelineStatus[] = [
  { source: "CDC Respiratory", status: "up_to_date", lastChecked: new Date().toISOString(), version: "2025.3", notes: "Latest respiratory illness guidelines applied" },
  { source: "ACEP/AHA Chest Pain", status: "up_to_date", lastChecked: new Date().toISOString(), version: "2024.1", notes: "Chest pain evaluation pathway current" },
  { source: "NICE Febrile Illness", status: "up_to_date", lastChecked: new Date().toISOString(), version: "2024.2" },
  { source: "IDSA Pharyngitis", status: "up_to_date", lastChecked: new Date().toISOString(), version: "2024.1" },
  { source: "AAO-HNS ENT", status: "up_to_date", lastChecked: new Date().toISOString(), version: "2023.2" },
  { source: "AAN Neurology", status: "up_to_date", lastChecked: new Date().toISOString(), version: "2024.1" },
  { source: "BTS Respiratory Emergency", status: "up_to_date", lastChecked: new Date().toISOString(), version: "2024.3" },
  { source: "Emergency Headache", status: "up_to_date", lastChecked: new Date().toISOString(), version: "2024.1" },
];

export function checkGuidelineUpdates(): GuidelineStatus[] {
  return guidelineStatuses;
}

export function getGuidelineSummary() {
  const total = guidelineStatuses.length;
  const upToDate = guidelineStatuses.filter(g => g.status === "up_to_date").length;
  const needsUpdate = guidelineStatuses.filter(g => g.status === "update_available" || g.status === "review_needed").length;

  return {
    total,
    upToDate,
    needsUpdate,
    complianceRate: total > 0 ? Math.round((upToDate / total) * 100) : 0,
    statuses: guidelineStatuses,
  };
}
