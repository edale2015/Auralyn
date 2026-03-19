type ParsedIntent = {
  goal: string;
  category: "benefits" | "insurance" | "healthcare" | "housing" | "employment" | "general";
  programs: string[];
  urgency: "low" | "medium" | "high";
  requiredData: string[];
};

const intentPatterns: Array<{
  keywords: string[];
  goal: string;
  category: ParsedIntent["category"];
  programs: string[];
  requiredData: string[];
}> = [
  {
    keywords: ["snap", "food stamps", "food assistance", "ebt", "hungry"],
    goal: "apply_snap",
    category: "benefits",
    programs: ["SNAP"],
    requiredData: ["firstName", "lastName", "dob", "ssn", "income", "householdSize", "address", "state"]
  },
  {
    keywords: ["medicaid", "health insurance", "medical coverage", "low income health"],
    goal: "apply_medicaid",
    category: "healthcare",
    programs: ["Medicaid"],
    requiredData: ["firstName", "lastName", "dob", "ssn", "income", "householdSize", "address", "state", "children"]
  },
  {
    keywords: ["housing", "section 8", "rent assistance", "homeless", "shelter"],
    goal: "apply_housing",
    category: "housing",
    programs: ["Section8", "HousingAssistance"],
    requiredData: ["firstName", "lastName", "dob", "income", "householdSize", "address", "currentRent"]
  },
  {
    keywords: ["unemployment", "lost job", "laid off", "fired", "jobless"],
    goal: "apply_unemployment",
    category: "employment",
    programs: ["UnemploymentInsurance"],
    requiredData: ["firstName", "lastName", "dob", "ssn", "lastEmployer", "lastSalary", "terminationDate"]
  },
  {
    keywords: ["wic", "women infants children", "baby formula", "pregnant"],
    goal: "apply_wic",
    category: "benefits",
    programs: ["WIC"],
    requiredData: ["firstName", "lastName", "dob", "income", "householdSize", "pregnant", "children"]
  },
  {
    keywords: ["prior auth", "prior authorization", "insurance approval"],
    goal: "submit_prior_auth",
    category: "insurance",
    programs: ["PriorAuthorization"],
    requiredData: ["patientName", "insuranceId", "diagnosis", "procedure", "physician"]
  },
  {
    keywords: ["claim", "file claim", "insurance claim", "submit claim"],
    goal: "file_insurance_claim",
    category: "insurance",
    programs: ["InsuranceClaim"],
    requiredData: ["patientName", "insuranceId", "serviceDate", "diagnosis", "cptCode", "provider"]
  }
];

export class IntentEngine {
  parse(text: string): ParsedIntent {
    const lower = text.toLowerCase();

    for (const pattern of intentPatterns) {
      const match = pattern.keywords.some(k => lower.includes(k));
      if (match) {
        return {
          goal: pattern.goal,
          category: pattern.category,
          programs: pattern.programs,
          urgency: this.detectUrgency(lower),
          requiredData: pattern.requiredData
        };
      }
    }

    return {
      goal: "general_assistance",
      category: "general",
      programs: this.inferPrograms(lower),
      urgency: this.detectUrgency(lower),
      requiredData: ["firstName", "lastName", "dob", "income", "householdSize"]
    };
  }

  private detectUrgency(text: string): ParsedIntent["urgency"] {
    const urgent = ["emergency", "urgent", "immediately", "asap", "today", "homeless", "starving", "eviction"];
    const moderate = ["soon", "need help", "struggling", "behind on"];

    if (urgent.some(u => text.includes(u))) return "high";
    if (moderate.some(m => text.includes(m))) return "medium";
    return "low";
  }

  private inferPrograms(text: string): string[] {
    const programs: string[] = [];

    if (text.includes("income") || text.includes("money") || text.includes("kids") || text.includes("children")) {
      programs.push("SNAP", "Medicaid");
    }
    if (text.includes("job") || text.includes("work")) {
      programs.push("UnemploymentInsurance");
    }
    if (text.includes("rent") || text.includes("housing")) {
      programs.push("HousingAssistance");
    }

    return programs.length > 0 ? programs : ["GeneralAssistance"];
  }
}

export const intentEngine = new IntentEngine();
