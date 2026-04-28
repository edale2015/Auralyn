/**
 * priorAuthSkeleton.ts
 *
 * SKELETON — deterministic stub returning structured prior auth assessment.
 *
 * Production path:
 *   Replace getRulesForOrder() with a real CMS Coverage Database query.
 *   Claude for Healthcare enterprise orgs can query the CMS connector via
 *   the Anthropic API with the healthcare connector enabled.
 */

export interface PriorAuthRequest {
  caseId:           string;
  patientId?:       string;
  insuranceId?:     string;
  primaryDiagnosis: string;
  proposedOrders: Array<{
    type:     "lab" | "imaging" | "referral" | "prescription" | "procedure";
    code?:    string;
    display:  string;
  }>;
}

export interface PriorAuthAssessment {
  caseId:        string;
  overallStatus: "approved" | "likely_required" | "required" | "unknown";
  orders: Array<{
    display:               string;
    code?:                 string;
    authStatus:            "not_required" | "likely_required" | "required" | "unknown";
    rationale:             string;
    documentationNeeded?:  string[];
  }>;
  summary:     string;
  disclaimer:  string;
  generatedAt: string;
}

const STUB_PRIOR_AUTH_RULES: Record<string, { required: boolean; rationale: string; docs?: string[] }> = {
  "80053": { required: false, rationale: "Comprehensive metabolic panel — typically not prior auth required" },
  "85025": { required: false, rationale: "CBC — typically not prior auth required" },
  "83036": { required: false, rationale: "HbA1c — typically not prior auth required" },
  "70553": { required: true,  rationale: "MRI brain with contrast — most plans require prior auth",
             docs: ["Clinical indication", "Neurological exam findings", "Conservative treatment tried"] },
  "71250": { required: true,  rationale: "CT chest — prior auth required by most plans",
             docs: ["Clinical indication", "Relevant symptoms", "Supporting labs"] },
  "73721": { required: true,  rationale: "MRI joint — prior auth required",
             docs: ["Injury mechanism", "Conservative treatment record (6 weeks PT)", "X-ray results"] },
  "referral_cardiology":       { required: true,  rationale: "Cardiology referral — most HMO/EPO plans require PCP referral or prior auth",
                                 docs: ["EKG", "Clinical notes", "PCP referral letter"] },
  "referral_neurology":        { required: true,  rationale: "Neurology referral — prior auth commonly required",
                                 docs: ["Clinical notes", "Relevant imaging"] },
  "referral_gastroenterology": { required: true,  rationale: "GI referral — prior auth commonly required" },
  "referral_general":          { required: false, rationale: "General referral — auth requirements vary by plan" },
  "ozempic": { required: true, rationale: "GLP-1 agonist — most plans require prior auth for obesity/T2DM indication",
               docs: ["BMI documentation", "Failed first-line therapy", "Comorbidity documentation"] },
  "humira":  { required: true, rationale: "Biologic — prior auth always required",
               docs: ["Diagnosis confirmation", "Failed conventional therapy", "Step therapy documentation"] },
};

function getRulesForOrder(order: PriorAuthRequest["proposedOrders"][0]) {
  const codeKey = order.code ?? "";
  if (STUB_PRIOR_AUTH_RULES[codeKey]) return STUB_PRIOR_AUTH_RULES[codeKey];

  if (order.type === "referral") {
    const slug  = order.display.toLowerCase().replace(/\s+/g, "_");
    const match = Object.keys(STUB_PRIOR_AUTH_RULES).find(
      k => k.startsWith("referral_") && slug.includes(k.replace("referral_", ""))
    );
    if (match) return STUB_PRIOR_AUTH_RULES[match];
    return STUB_PRIOR_AUTH_RULES["referral_general"];
  }

  if (order.type === "imaging") {
    return { required: true, rationale: "Imaging orders frequently require prior auth — verify with payer", docs: ["Clinical indication"] };
  }

  if (order.type === "lab") {
    return { required: false, rationale: "Most lab orders do not require prior auth — verify for specialty labs" };
  }

  return { required: false, rationale: "Prior auth requirements unknown — verify with payer" };
}

export async function assessPriorAuth(
  request: PriorAuthRequest
): Promise<PriorAuthAssessment> {
  const orders = request.proposedOrders.map(order => {
    const rules = getRulesForOrder(order);
    return {
      display:             order.display,
      code:                order.code,
      authStatus:          rules.required ? "required" as const : "not_required" as const,
      rationale:           rules.rationale,
      documentationNeeded: rules.docs,
    };
  });

  const requiredCount = orders.filter(o => o.authStatus === "required").length;
  const overallStatus =
    requiredCount === 0              ? "approved" :
    requiredCount === orders.length  ? "required" : "likely_required";

  const summary = requiredCount === 0
    ? "No prior authorization appears required for the proposed orders."
    : `${requiredCount} of ${orders.length} proposed order(s) likely require prior authorization. Review documentation requirements before ordering.`;

  return {
    caseId:        request.caseId,
    overallStatus,
    orders,
    summary,
    disclaimer:    "This is an AI-generated preliminary assessment based on general coverage patterns. Actual prior authorization requirements depend on the specific payer, plan, and patient policy. Always verify with the payer before ordering.",
    generatedAt:   new Date().toISOString(),
  };
}
