import { channelConfig } from "../channels/channelConfig";

export function generateCaseLink(caseId: string): string {
  const base = channelConfig.publicBaseUrl.replace(/\/$/, "");
  return `${base}/physician/case/${caseId}`;
}

export function generateMobileLink(caseId: string): string {
  const base = channelConfig.publicBaseUrl.replace(/\/$/, "");
  return `${base}/physician-mobile?case=${caseId}`;
}

export function generateReviewLink(caseId: string): string {
  const base = channelConfig.publicBaseUrl.replace(/\/$/, "");
  return `${base}/clinical-review?case=${caseId}`;
}
