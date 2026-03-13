export interface ProviderStats {
  physicianId: string;
  name: string;
  specialty: string;
  casesReviewed: number;
  approvalRate: number;
  avgTimeToReviewMin: number;
  overrideRate: number;
  flaggedCases: number;
  lastActive: string;
  trend: "up" | "down" | "stable";
}

const MOCK_PROVIDERS: ProviderStats[] = [
  {
    physicianId: "MD001",
    name: "Dr. Sarah Chen",
    specialty: "Internal Medicine",
    casesReviewed: 142,
    approvalRate: 94.4,
    avgTimeToReviewMin: 8.2,
    overrideRate: 5.6,
    flaggedCases: 3,
    lastActive: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    trend: "up",
  },
  {
    physicianId: "MD002",
    name: "Dr. James Patel",
    specialty: "Family Medicine",
    casesReviewed: 98,
    approvalRate: 87.8,
    avgTimeToReviewMin: 12.5,
    overrideRate: 12.2,
    flaggedCases: 7,
    lastActive: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    trend: "down",
  },
  {
    physicianId: "MD003",
    name: "Dr. Amanda Torres",
    specialty: "Urgent Care",
    casesReviewed: 211,
    approvalRate: 96.7,
    avgTimeToReviewMin: 5.8,
    overrideRate: 3.3,
    flaggedCases: 1,
    lastActive: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    trend: "up",
  },
  {
    physicianId: "MD004",
    name: "Dr. Kevin Walsh",
    specialty: "Pediatrics",
    casesReviewed: 76,
    approvalRate: 90.8,
    avgTimeToReviewMin: 9.7,
    overrideRate: 9.2,
    flaggedCases: 4,
    lastActive: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    trend: "stable",
  },
  {
    physicianId: "MD005",
    name: "Dr. Priya Nair",
    specialty: "ENT",
    casesReviewed: 163,
    approvalRate: 98.2,
    avgTimeToReviewMin: 6.3,
    overrideRate: 1.8,
    flaggedCases: 0,
    lastActive: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    trend: "up",
  },
  {
    physicianId: "MD006",
    name: "Dr. Robert Kim",
    specialty: "Emergency Medicine",
    casesReviewed: 54,
    approvalRate: 83.3,
    avgTimeToReviewMin: 15.1,
    overrideRate: 16.7,
    flaggedCases: 9,
    lastActive: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    trend: "down",
  },
];

export function listProviders(): ProviderStats[] {
  return MOCK_PROVIDERS;
}

export function getProvider(id: string): ProviderStats | null {
  return MOCK_PROVIDERS.find(p => p.physicianId === id) ?? null;
}

export function getProviderSummary() {
  const total = MOCK_PROVIDERS.reduce((sum, p) => sum + p.casesReviewed, 0);
  const avgApproval = (MOCK_PROVIDERS.reduce((s, p) => s + p.approvalRate, 0) / MOCK_PROVIDERS.length).toFixed(1);
  const avgTime = (MOCK_PROVIDERS.reduce((s, p) => s + p.avgTimeToReviewMin, 0) / MOCK_PROVIDERS.length).toFixed(1);
  const totalFlagged = MOCK_PROVIDERS.reduce((s, p) => s + p.flaggedCases, 0);
  return { providerCount: MOCK_PROVIDERS.length, totalCasesReviewed: total, avgApprovalRate: Number(avgApproval), avgTimeToReviewMin: Number(avgTime), totalFlaggedCases: totalFlagged };
}
