export interface GovernanceCheck {
  approved: boolean;
  version?: string;
  reason?: string;
  checkedAt: number;
}

export class GovernanceLayer {
  validateDeployment(version: any): GovernanceCheck {
    if (!version || version.status !== "approved") {
      return {
        approved: false,
        version: version?.id || "unknown",
        reason: "Version not approved for deployment",
        checkedAt: Date.now(),
      };
    }
    return {
      approved: true,
      version: version.id,
      checkedAt: Date.now(),
    };
  }

  validateChange(change: any): GovernanceCheck {
    if (!change?.reviewedBy) {
      return {
        approved: false,
        reason: "Change has not been reviewed",
        checkedAt: Date.now(),
      };
    }
    return { approved: true, checkedAt: Date.now() };
  }
}

export const governanceLayer = new GovernanceLayer();
