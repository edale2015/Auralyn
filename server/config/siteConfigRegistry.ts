export type SiteConfig = {
  siteId: string;
  name: string;
  enabledComplaints: string[];
  enabledModules: string[];
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
  },
];

export function getSiteConfig(siteId = "default"): SiteConfig {
  return SITE_CONFIGS.find((s) => s.siteId === siteId) ?? SITE_CONFIGS[0];
}
