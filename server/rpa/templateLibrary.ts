export interface RPAStep {
  type: "click" | "type" | "select" | "wait" | "screenshot" | "assert";
  selector?: string;
  value?: string;
  timeout?: number;
  description?: string;
}

export interface RPATemplate {
  id: string;
  name: string;
  description: string;
  url: string;
  steps: RPAStep[];
  category: "patient-intake" | "billing" | "government-form" | "ehr" | "insurance" | "pharmacy" | "custom";
}

export const templates: Record<string, RPATemplate> = {
  patientIntake: {
    id: "patient-intake",
    name: "Patient Intake Form",
    description: "Fills out a standard patient intake form",
    url: "/intake",
    category: "patient-intake",
    steps: [
      { type: "type", selector: "#name", value: "{{patientName}}", description: "Enter patient name" },
      { type: "type", selector: "#dob", value: "{{dateOfBirth}}", description: "Enter date of birth" },
      { type: "select", selector: "#complaint", value: "{{complaint}}", description: "Select chief complaint" },
      { type: "click", selector: "#submit", description: "Submit intake form" },
      { type: "wait", timeout: 2000, description: "Wait for confirmation" },
    ],
  },
  billingSubmission: {
    id: "billing-submission",
    name: "Insurance Billing Submission",
    description: "Submits a claim to insurance payer portal",
    url: "{{payerPortalUrl}}",
    category: "billing",
    steps: [
      { type: "type", selector: "#patient-id", value: "{{patientId}}", description: "Enter patient ID" },
      { type: "type", selector: "#claim-amount", value: "{{claimAmount}}", description: "Enter claim amount" },
      { type: "type", selector: "#diagnosis-code", value: "{{icd10Code}}", description: "Enter ICD-10 code" },
      { type: "type", selector: "#cpt-code", value: "{{cptCode}}", description: "Enter CPT code" },
      { type: "click", selector: "#submit-claim", description: "Submit claim" },
      { type: "screenshot", description: "Capture confirmation" },
    ],
  },
  ehrDataEntry: {
    id: "ehr-data-entry",
    name: "EHR Chart Entry",
    description: "Enters clinical notes into an EHR system",
    url: "{{ehrUrl}}/chart/{{patientId}}",
    category: "ehr",
    steps: [
      { type: "click", selector: ".new-note-btn", description: "Create new note" },
      { type: "select", selector: "#note-type", value: "progress-note", description: "Select note type" },
      { type: "type", selector: "#note-content", value: "{{clinicalNote}}", description: "Enter clinical note" },
      { type: "click", selector: "#sign-note", description: "Sign and save note" },
    ],
  },
  priorAuth: {
    id: "prior-auth",
    name: "Prior Authorization Request",
    description: "Submits a prior authorization request to an insurance payer",
    url: "{{payerPortalUrl}}/prior-auth",
    category: "insurance",
    steps: [
      { type: "type", selector: "#member-id", value: "{{memberId}}", description: "Enter member ID" },
      { type: "type", selector: "#npi", value: "{{npi}}", description: "Enter provider NPI" },
      { type: "type", selector: "#procedure-code", value: "{{cptCode}}", description: "Enter procedure code" },
      { type: "type", selector: "#diagnosis", value: "{{icd10Code}}", description: "Enter diagnosis code" },
      { type: "type", selector: "#clinical-notes", value: "{{clinicalJustification}}", description: "Enter clinical justification" },
      { type: "click", selector: "#submit-auth", description: "Submit PA request" },
      { type: "screenshot", description: "Capture auth number" },
    ],
  },
};

export function getTemplate(id: string): RPATemplate | undefined {
  return templates[id];
}

export function listTemplates(): RPATemplate[] {
  return Object.values(templates);
}

templates.pharmacyForm = {
  id: "pharmacy-form",
  name: "Pharmacy Prescription Form",
  description: "Submits a prescription form to a pharmacy portal",
  url: "{{pharmacyUrl}}/prescription",
  category: "pharmacy",
  steps: [
    { type: "type", selector: "#patient-name", value: "{{patientName}}", description: "Enter patient name" },
    { type: "type", selector: "#dob", value: "{{dateOfBirth}}", description: "Enter date of birth" },
    { type: "type", selector: "#rx-number", value: "{{rxNumber}}", description: "Enter prescription number" },
    { type: "type", selector: "#medication", value: "{{medicationName}}", description: "Enter medication name" },
    { type: "type", selector: "#quantity", value: "{{quantity}}", description: "Enter quantity" },
    { type: "select", selector: "#refills", value: "{{refills}}", description: "Select refill count" },
    { type: "click", selector: "#submit", description: "Submit prescription form" },
    { type: "wait", timeout: 2000, description: "Wait for confirmation" },
    { type: "screenshot", description: "Capture confirmation number" },
  ],
};

templates.governmentForm = {
  id: "government-form",
  name: "Government Reporting Form",
  description: "Fills out a government regulatory reporting form",
  url: "https://example.gov/form",
  category: "government-form",
  steps: [
    { type: "type", selector: "#name", value: "{{reporterName}}", description: "Enter reporter name" },
    { type: "type", selector: "#facility-id", value: "{{facilityId}}", description: "Enter facility ID" },
    { type: "type", selector: "#event-date", value: "{{eventDate}}", description: "Enter event date" },
    { type: "type", selector: "#description", value: "{{eventDescription}}", description: "Enter event description" },
    { type: "click", selector: "#submit", description: "Submit report" },
  ],
};

export function fillTemplate(template: RPATemplate, variables: Record<string, string>): RPATemplate {
  const filled = JSON.parse(JSON.stringify(template)) as RPATemplate;
  filled.url = replaceVars(filled.url, variables);
  filled.steps = filled.steps.map(step => ({
    ...step,
    value: step.value ? replaceVars(step.value, variables) : step.value,
    selector: step.selector ? replaceVars(step.selector, variables) : step.selector,
  }));
  return filled;
}

function replaceVars(str: string, vars: Record<string, string>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}
