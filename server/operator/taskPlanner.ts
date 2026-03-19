type TaskStep = {
  id: number;
  action: "navigate" | "fill" | "click" | "select" | "upload" | "verify" | "wait" | "screenshot";
  target?: string;
  field?: string;
  value?: string;
  url?: string;
  description: string;
  requiresApproval: boolean;
  timeout?: number;
};

type TaskPlan = {
  goal: string;
  program: string;
  steps: TaskStep[];
  estimatedDuration: number;
  riskLevel: "low" | "medium" | "high";
};

const planTemplates: Record<string, TaskStep[]> = {
  apply_snap: [
    { id: 1, action: "navigate", url: "https://mybenefits.ny.gov", description: "Open NY Benefits portal", requiresApproval: false },
    { id: 2, action: "click", target: "Apply for Benefits", description: "Click Apply button", requiresApproval: false },
    { id: 3, action: "fill", field: "firstName", description: "Enter first name", requiresApproval: false },
    { id: 4, action: "fill", field: "lastName", description: "Enter last name", requiresApproval: false },
    { id: 5, action: "fill", field: "dob", description: "Enter date of birth", requiresApproval: false },
    { id: 6, action: "fill", field: "ssn", description: "Enter SSN", requiresApproval: true },
    { id: 7, action: "fill", field: "income", description: "Enter monthly income", requiresApproval: false },
    { id: 8, action: "fill", field: "householdSize", description: "Enter household size", requiresApproval: false },
    { id: 9, action: "fill", field: "address", description: "Enter address", requiresApproval: false },
    { id: 10, action: "verify", description: "Verify all fields are correct", requiresApproval: true },
    { id: 11, action: "click", target: "Submit", description: "Submit application", requiresApproval: true },
    { id: 12, action: "screenshot", description: "Capture confirmation", requiresApproval: false }
  ],
  apply_medicaid: [
    { id: 1, action: "navigate", url: "https://nystateofhealth.ny.gov", description: "Open NY State of Health", requiresApproval: false },
    { id: 2, action: "click", target: "Apply", description: "Start application", requiresApproval: false },
    { id: 3, action: "fill", field: "firstName", description: "Enter first name", requiresApproval: false },
    { id: 4, action: "fill", field: "lastName", description: "Enter last name", requiresApproval: false },
    { id: 5, action: "fill", field: "dob", description: "Enter date of birth", requiresApproval: false },
    { id: 6, action: "fill", field: "ssn", description: "Enter SSN", requiresApproval: true },
    { id: 7, action: "fill", field: "income", description: "Enter household income", requiresApproval: false },
    { id: 8, action: "fill", field: "children", description: "Enter number of dependents", requiresApproval: false },
    { id: 9, action: "fill", field: "address", description: "Enter address", requiresApproval: false },
    { id: 10, action: "verify", description: "Review all information", requiresApproval: true },
    { id: 11, action: "click", target: "Submit", description: "Submit Medicaid application", requiresApproval: true },
    { id: 12, action: "screenshot", description: "Capture confirmation", requiresApproval: false }
  ],
  apply_housing: [
    { id: 1, action: "navigate", url: "https://housingconnect.nyc.gov", description: "Open NYC Housing Connect", requiresApproval: false },
    { id: 2, action: "fill", field: "firstName", description: "Enter first name", requiresApproval: false },
    { id: 3, action: "fill", field: "lastName", description: "Enter last name", requiresApproval: false },
    { id: 4, action: "fill", field: "income", description: "Enter annual income", requiresApproval: false },
    { id: 5, action: "fill", field: "householdSize", description: "Enter household size", requiresApproval: false },
    { id: 6, action: "fill", field: "currentRent", description: "Enter current rent", requiresApproval: false },
    { id: 7, action: "verify", description: "Review application", requiresApproval: true },
    { id: 8, action: "click", target: "Submit", description: "Submit housing application", requiresApproval: true }
  ],
  apply_unemployment: [
    { id: 1, action: "navigate", url: "https://labor.ny.gov/ui/claimantinfo", description: "Open NY DOL Unemployment", requiresApproval: false },
    { id: 2, action: "fill", field: "firstName", description: "Enter first name", requiresApproval: false },
    { id: 3, action: "fill", field: "lastName", description: "Enter last name", requiresApproval: false },
    { id: 4, action: "fill", field: "ssn", description: "Enter SSN", requiresApproval: true },
    { id: 5, action: "fill", field: "lastEmployer", description: "Enter last employer", requiresApproval: false },
    { id: 6, action: "fill", field: "lastSalary", description: "Enter last salary", requiresApproval: false },
    { id: 7, action: "fill", field: "terminationDate", description: "Enter termination date", requiresApproval: false },
    { id: 8, action: "verify", description: "Review all information", requiresApproval: true },
    { id: 9, action: "click", target: "File Claim", description: "Submit unemployment claim", requiresApproval: true }
  ],
  submit_prior_auth: [
    { id: 1, action: "navigate", description: "Open payer portal", requiresApproval: false },
    { id: 2, action: "fill", field: "patientName", description: "Enter patient name", requiresApproval: false },
    { id: 3, action: "fill", field: "insuranceId", description: "Enter insurance ID", requiresApproval: false },
    { id: 4, action: "fill", field: "diagnosis", description: "Enter diagnosis", requiresApproval: false },
    { id: 5, action: "fill", field: "procedure", description: "Enter requested procedure", requiresApproval: false },
    { id: 6, action: "fill", field: "physician", description: "Enter ordering physician", requiresApproval: false },
    { id: 7, action: "upload", field: "clinicalNotes", description: "Upload clinical documentation", requiresApproval: true },
    { id: 8, action: "verify", description: "Review prior auth request", requiresApproval: true },
    { id: 9, action: "click", target: "Submit", description: "Submit prior authorization", requiresApproval: true }
  ],
  file_insurance_claim: [
    { id: 1, action: "navigate", description: "Open clearinghouse portal", requiresApproval: false },
    { id: 2, action: "fill", field: "patientName", description: "Enter patient name", requiresApproval: false },
    { id: 3, action: "fill", field: "insuranceId", description: "Enter insurance ID", requiresApproval: false },
    { id: 4, action: "fill", field: "serviceDate", description: "Enter date of service", requiresApproval: false },
    { id: 5, action: "fill", field: "diagnosis", description: "Enter ICD-10 diagnosis", requiresApproval: false },
    { id: 6, action: "fill", field: "cptCode", description: "Enter CPT code", requiresApproval: false },
    { id: 7, action: "verify", description: "Review claim details", requiresApproval: true },
    { id: 8, action: "click", target: "Submit Claim", description: "Submit insurance claim", requiresApproval: true }
  ]
};

export class TaskPlanner {
  createPlan(goal: string, program: string, userData: Record<string, any>): TaskPlan {
    const templateSteps = planTemplates[goal] || this.generateGenericPlan(program);

    const steps = templateSteps.map(step => {
      if (step.field && userData[step.field]) {
        return { ...step, value: String(userData[step.field]) };
      }
      return { ...step };
    });

    const riskLevel = steps.some(s => s.field === "ssn") ? "high" :
                      steps.length > 8 ? "medium" : "low";

    return {
      goal,
      program,
      steps,
      estimatedDuration: steps.length * 3,
      riskLevel
    };
  }

  private generateGenericPlan(program: string): TaskStep[] {
    return [
      { id: 1, action: "navigate", description: `Open ${program} portal`, requiresApproval: false },
      { id: 2, action: "fill", field: "firstName", description: "Enter first name", requiresApproval: false },
      { id: 3, action: "fill", field: "lastName", description: "Enter last name", requiresApproval: false },
      { id: 4, action: "fill", field: "dob", description: "Enter date of birth", requiresApproval: false },
      { id: 5, action: "verify", description: "Review information", requiresApproval: true },
      { id: 6, action: "click", target: "Submit", description: "Submit application", requiresApproval: true }
    ];
  }

  getAvailableTemplates(): Array<{ goal: string; program: string; stepCount: number }> {
    return Object.entries(planTemplates).map(([goal, steps]) => ({
      goal,
      program: goal.replace("apply_", "").replace("submit_", "").replace("file_", "").toUpperCase(),
      stepCount: steps.length
    }));
  }
}

export const taskPlanner = new TaskPlanner();
