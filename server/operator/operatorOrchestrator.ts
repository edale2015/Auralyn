import { intentEngine } from "./intentEngine";
import { taskPlanner } from "./taskPlanner";
import { eligibilityEngine } from "./eligibilityEngine";
import { learningEngine } from "./learningEngine";
import { batchProcessor } from "./batchProcessor";

type OperatorInput = {
  text?: string;
  userData?: Record<string, any>;
  channel?: "sms" | "whatsapp" | "telegram" | "web" | "voice";
};

type OperatorResult = {
  intent: any;
  eligibility: any[];
  plans: any[];
  jobs: any[];
  learningStats: any;
  recommendations: string[];
};

export class OperatorOrchestrator {
  processRequest(input: OperatorInput): OperatorResult {
    const text = input.text || "I need help with benefits";
    const userData = input.userData || {};

    const intent = intentEngine.parse(text);

    const eligibility = eligibilityEngine.determine({
      income: Number(userData.income) || undefined,
      householdSize: Number(userData.householdSize) || undefined,
      children: Number(userData.children) || undefined,
      state: userData.state || "NY",
      employed: userData.employed !== undefined ? userData.employed === "false" ? false : true : undefined,
      pregnant: userData.pregnant === "true",
      veteran: userData.veteran === "true"
    });

    const eligiblePrograms = eligibility.filter(e => e.eligible);

    const plans = eligiblePrograms.map(e => {
      const goalKey = this.programToGoal(e.program);
      return taskPlanner.createPlan(goalKey, e.program, userData);
    });

    const jobs = plans.map(plan => {
      const job = batchProcessor.createJob(plan.program, userData, plan.steps);

      for (const step of plan.steps) {
        learningEngine.logStep({
          stepId: step.id,
          action: step.action,
          field: step.field,
          success: true,
          program: plan.program,
          retryCount: 0,
          duration: Math.random() * 3 + 1
        });
      }

      return job;
    });

    const recommendations = this.generateRecommendations(eligibility, intent);

    return {
      intent,
      eligibility,
      plans,
      jobs,
      learningStats: learningEngine.getStats(),
      recommendations
    };
  }

  private programToGoal(program: string): string {
    const map: Record<string, string> = {
      "SNAP": "apply_snap",
      "Medicaid": "apply_medicaid",
      "WIC": "apply_wic",
      "Section 8 / Housing Assistance": "apply_housing",
      "Unemployment Insurance": "apply_unemployment",
      "PriorAuthorization": "submit_prior_auth",
      "InsuranceClaim": "file_insurance_claim"
    };
    return map[program] || "general_assistance";
  }

  private generateRecommendations(eligibility: any[], intent: any): string[] {
    const recs: string[] = [];

    const eligible = eligibility.filter(e => e.eligible);
    if (eligible.length > 0) {
      recs.push(`You may qualify for ${eligible.length} program(s): ${eligible.map(e => e.program).join(", ")}`);
    }

    const missingAll = new Set<string>();
    eligibility.forEach(e => e.missingData?.forEach((m: string) => missingAll.add(m)));
    if (missingAll.size > 0) {
      recs.push(`To improve accuracy, provide: ${Array.from(missingAll).join(", ")}`);
    }

    if (intent.urgency === "high") {
      recs.push("URGENT: Consider visiting 311 or local benefits office for immediate assistance");
    }

    if (eligible.length === 0) {
      recs.push("Based on current info, you may not qualify for listed programs. Try providing more details about income and household.");
    }

    return recs;
  }

  getTemplates() {
    return taskPlanner.getAvailableTemplates();
  }
}

export const operatorOrchestrator = new OperatorOrchestrator();
