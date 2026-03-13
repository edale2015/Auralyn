import { TenantSiteConfig } from "./platformTypes";

export const PLATFORM_CONFIGS: TenantSiteConfig[] = [
  {
    siteId: "default",
    siteName: "Default Urgent Care",
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
      "learning",
      "governance",
      "platform",
    ],
    rolloutModes: {
      sore_throat: "graph",
      cough: "graph",
      uti: "graph",
      chest_pain: "sequential",
      abdominal_pain: "sequential",
      fever: "sequential",
      rash: "sequential",
      ear_pain: "sequential",
      sinus_pressure: "sequential",
    },
    maxLlmCostUsdPerCase: 0.03,
    requireReasoningSummary: true,
    requireGoldenPassRate: 0.95,
  },
];

export function getPlatformConfig(siteId = "default"): TenantSiteConfig {
  return PLATFORM_CONFIGS.find((p) => p.siteId === siteId) ?? PLATFORM_CONFIGS[0];
}
