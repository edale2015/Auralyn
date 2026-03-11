export type ComplaintRolloutMode = "sequential" | "graph" | "compare";

export type SiteConfig = {
  siteId: string;
  name: string;
  enabledComplaints: string[];
  enabledModules: string[];
  complaintRolloutModes?: Record<string, ComplaintRolloutMode>;
};

export const SITE_CONFIGS: SiteConfig[] = [
  {
    siteId: "default",
    name: "Default Clinic",
    enabledComplaints: [
      "sore_throat",
      "cough",
      "uti",
      "chest_pain",
      "abdominal_pain",
      "fever",
      "rash",
      "ear_pain",
      "sinus_pressure",
    ],
    enabledModules: [
      "intake",
      "triage",
      "reasoning",
      "output",
      "outcomes",
      "analytics",
    ],
    complaintRolloutModes: {
      sore_throat: "graph",
      cough: "graph",
      uti: "graph",
      chest_pain: "sequential",
      abdominal_pain: "sequential",
      fever: "sequential",
    },
  },
];

export function getSiteConfig(siteId = "default"): SiteConfig {
  return SITE_CONFIGS.find((s) => s.siteId === siteId) ?? SITE_CONFIGS[0];
}

export function getComplaintRolloutMode(
  complaintId: string,
  siteId = "default"
): ComplaintRolloutMode {
  const cfg = getSiteConfig(siteId);
  return cfg.complaintRolloutModes?.[complaintId] ?? "sequential";
}
