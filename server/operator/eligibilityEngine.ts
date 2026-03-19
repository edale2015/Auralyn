type UserProfile = {
  income?: number;
  householdSize?: number;
  children?: number;
  age?: number;
  pregnant?: boolean;
  disabled?: boolean;
  veteran?: boolean;
  citizen?: boolean;
  state?: string;
  employed?: boolean;
};

type EligibilityResult = {
  program: string;
  eligible: boolean;
  confidence: number;
  reason: string;
  estimatedBenefit?: string;
  requirements: string[];
  missingData: string[];
};

const FPL_2024: Record<number, number> = {
  1: 15060, 2: 20440, 3: 25820, 4: 31200, 5: 36580, 6: 41960, 7: 47340, 8: 52720
};

function getFPL(householdSize: number): number {
  return FPL_2024[Math.min(householdSize, 8)] || FPL_2024[1];
}

export class EligibilityEngine {
  determine(profile: UserProfile): EligibilityResult[] {
    const results: EligibilityResult[] = [];
    const annualIncome = (profile.income || 0) * 12;
    const hhSize = profile.householdSize || 1;
    const fpl = getFPL(hhSize);

    results.push(this.checkSNAP(profile, annualIncome, fpl));
    results.push(this.checkMedicaid(profile, annualIncome, fpl));
    results.push(this.checkWIC(profile, annualIncome, fpl));
    results.push(this.checkHousing(profile, annualIncome, fpl));
    results.push(this.checkUnemployment(profile));

    return results.filter(r => r.eligible || r.confidence > 0.3);
  }

  private checkSNAP(profile: UserProfile, income: number, fpl: number): EligibilityResult {
    const threshold = fpl * 1.3;
    const eligible = income <= threshold;
    const missing = this.findMissing(profile, ["income", "householdSize", "state"]);

    return {
      program: "SNAP",
      eligible,
      confidence: missing.length === 0 ? (eligible ? 0.9 : 0.1) : 0.5,
      reason: eligible ? `Income $${income}/yr is below ${130}% FPL ($${threshold})` : `Income exceeds SNAP threshold`,
      estimatedBenefit: eligible ? `$${Math.round(234 * (profile.householdSize || 1) * 0.6)}/month` : undefined,
      requirements: ["US citizen or qualified non-citizen", "Meet income limits", "Provide SSN for household members"],
      missingData: missing
    };
  }

  private checkMedicaid(profile: UserProfile, income: number, fpl: number): EligibilityResult {
    const threshold = fpl * 1.38;
    const eligible = income <= threshold;
    const missing = this.findMissing(profile, ["income", "householdSize", "state", "children"]);

    return {
      program: "Medicaid",
      eligible,
      confidence: missing.length === 0 ? (eligible ? 0.85 : 0.1) : 0.5,
      reason: eligible ? `Income below 138% FPL — likely eligible` : `Income exceeds Medicaid threshold`,
      estimatedBenefit: eligible ? "Full health coverage" : undefined,
      requirements: ["NY resident", "Meet income guidelines", "Provide identity verification"],
      missingData: missing
    };
  }

  private checkWIC(profile: UserProfile, income: number, fpl: number): EligibilityResult {
    const threshold = fpl * 1.85;
    const hasQualifier = (profile.pregnant || (profile.children && profile.children > 0));
    const eligible = income <= threshold && !!hasQualifier;

    return {
      program: "WIC",
      eligible,
      confidence: hasQualifier ? (eligible ? 0.85 : 0.2) : 0.1,
      reason: eligible ? "Income eligible with qualifying dependents" : hasQualifier ? "Income too high" : "No qualifying dependents (pregnant/infant/child under 5)",
      estimatedBenefit: eligible ? "$50-75/month in food benefits" : undefined,
      requirements: ["Pregnant, breastfeeding, or child under 5", "Meet income guidelines", "NY resident"],
      missingData: this.findMissing(profile, ["income", "children", "pregnant"])
    };
  }

  private checkHousing(profile: UserProfile, income: number, fpl: number): EligibilityResult {
    const eligible = income <= fpl * 0.5;

    return {
      program: "Section 8 / Housing Assistance",
      eligible,
      confidence: eligible ? 0.6 : 0.2,
      reason: eligible ? "Income below 50% AMI — eligible for waitlist" : "Income may exceed housing assistance limits",
      estimatedBenefit: eligible ? "Subsidized rent (pay 30% of income)" : undefined,
      requirements: ["Meet local income limits", "US citizen or eligible immigrant", "Pass background check"],
      missingData: this.findMissing(profile, ["income", "householdSize"])
    };
  }

  private checkUnemployment(profile: UserProfile): EligibilityResult {
    const eligible = profile.employed === false;

    return {
      program: "Unemployment Insurance",
      eligible,
      confidence: eligible ? 0.7 : 0.1,
      reason: eligible ? "Currently unemployed — likely eligible if previously employed" : "Currently employed or status unknown",
      estimatedBenefit: eligible ? "Up to $504/week (NY max)" : undefined,
      requirements: ["Previously employed in NY", "Lost job through no fault", "Able and available to work", "Actively seeking employment"],
      missingData: this.findMissing(profile, ["employed"])
    };
  }

  private findMissing(profile: UserProfile, required: string[]): string[] {
    return required.filter(field => profile[field as keyof UserProfile] === undefined || profile[field as keyof UserProfile] === null);
  }
}

export const eligibilityEngine = new EligibilityEngine();
