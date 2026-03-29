export interface EncounterROIData {
  encounterId?: string;
  revenue: number;
  denied: boolean;
  hccCaptured?: boolean;
  denialReason?: string;
}

export interface ROIReport {
  totalEncounters: number;
  totalRevenue: number;
  revenuePerEncounter: number;
  denialRate: number;
  deniedRevenueLost: number;
  hccCaptureRate: number;
  estimatedHCCUplift: number;
  netRevenueWithHCC: number;
  roi90Days: number;
}

const HCC_UPLIFT_PER_PATIENT = 320;

export function computeROI(data: EncounterROIData[]): ROIReport {
  if (data.length === 0) {
    return {
      totalEncounters: 0, totalRevenue: 0, revenuePerEncounter: 0,
      denialRate: 0, deniedRevenueLost: 0, hccCaptureRate: 0,
      estimatedHCCUplift: 0, netRevenueWithHCC: 0, roi90Days: 0,
    };
  }

  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
  const totalEncounters = data.length;
  const denied = data.filter((d) => d.denied);
  const hccCaptured = data.filter((d) => d.hccCaptured);

  const deniedRevenueLost = denied.reduce((sum, d) => sum + d.revenue, 0);
  const hccCaptureRate = +(hccCaptured.length / totalEncounters).toFixed(3);
  const estimatedHCCUplift = hccCaptured.length * HCC_UPLIFT_PER_PATIENT;
  const netRevenueWithHCC = totalRevenue + estimatedHCCUplift;

  return {
    totalEncounters,
    totalRevenue: +totalRevenue.toFixed(2),
    revenuePerEncounter: +(totalRevenue / totalEncounters).toFixed(2),
    denialRate: +((denied.length / totalEncounters) * 100).toFixed(1),
    deniedRevenueLost: +deniedRevenueLost.toFixed(2),
    hccCaptureRate,
    estimatedHCCUplift: +estimatedHCCUplift.toFixed(2),
    netRevenueWithHCC: +netRevenueWithHCC.toFixed(2),
    roi90Days: +(netRevenueWithHCC * 3).toFixed(2),
  };
}

export function getROIStats() {
  return { active: true, hccUpliftPerPatient: HCC_UPLIFT_PER_PATIENT };
}
