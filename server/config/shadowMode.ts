export type ShadowModeConfig = {
  enabled: boolean;
  allowExportAfterSignoffOnly: boolean;
  autoCloseAfterExport: boolean;
  requirePhysicianSignoffForAllCases: boolean;
  logEveryEngineRun: boolean;
  logEveryDiscrepancy: boolean;
  allowedSourceChannels: string[];
  notes: string[];
};

export const shadowModeConfig: ShadowModeConfig = {
  enabled: (process.env.SHADOW_MODE_ENABLED ?? "true").toLowerCase() === "true",
  allowExportAfterSignoffOnly: true,
  autoCloseAfterExport: false,
  requirePhysicianSignoffForAllCases: true,
  logEveryEngineRun: true,
  logEveryDiscrepancy: true,
  allowedSourceChannels: ["telegram", "web_chat", "internal_dashboard", "unknown"],
  notes: [
    "Shadow mode means the engine can recommend but not autonomously finalize care.",
    "All clinical actions remain physician-reviewed.",
    "Export bundles are sidecar outputs, not direct chart writeback."
  ]
};

export function assertShadowModeEnabled() {
  if (!shadowModeConfig.enabled) {
    throw new Error("Shadow mode is disabled");
  }
}
