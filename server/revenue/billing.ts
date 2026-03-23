export interface BillingCode {
  icd10: string;
  cpt: string;
  description: string;
  expectedReimbursement: number;
}

export interface BillingResult {
  codes: BillingCode[];
  totalExpectedReimbursement: number;
  primaryDiagnosis: string;
  billedAt: string;
}

const DIAGNOSIS_MAP: Record<string, BillingCode> = {
  strep: {
    icd10: "J02.0",
    cpt: "87880",
    description: "Streptococcal pharyngitis — rapid antigen test",
    expectedReimbursement: 42,
  },
  otitis_media: {
    icd10: "H66.90",
    cpt: "92552",
    description: "Acute otitis media — audiometry",
    expectedReimbursement: 65,
  },
  otitis_externa: {
    icd10: "H60.90",
    cpt: "69210",
    description: "Otitis externa — cerumen removal",
    expectedReimbursement: 58,
  },
  sinusitis: {
    icd10: "J32.9",
    cpt: "30300",
    description: "Chronic sinusitis — nasal endoscopy",
    expectedReimbursement: 78,
  },
  pneumonia: {
    icd10: "J18.9",
    cpt: "71046",
    description: "Community-acquired pneumonia — chest X-ray 2 view",
    expectedReimbursement: 95,
  },
  flu: {
    icd10: "J11.1",
    cpt: "87804",
    description: "Influenza — rapid test",
    expectedReimbursement: 38,
  },
  ear_pain: {
    icd10: "H92.09",
    cpt: "92552",
    description: "Otalgia — audiometry screening",
    expectedReimbursement: 55,
  },
  sore_throat: {
    icd10: "J02.9",
    cpt: "99213",
    description: "Pharyngitis — office visit level 3",
    expectedReimbursement: 85,
  },
};

const VISIT_CODE: BillingCode = {
  icd10: "Z00.00",
  cpt: "99213",
  description: "General office visit — level 3",
  expectedReimbursement: 85,
};

export function mapBilling(decision: {
  diagnosis?: string;
  complaints?: string[];
  recommendation?: string;
}): BillingResult {
  const codes: BillingCode[] = [];

  const key = decision.diagnosis
    ?? decision.complaints?.[0]?.toLowerCase().replace(" ", "_")
    ?? "sore_throat";

  const primaryCode = DIAGNOSIS_MAP[key] ?? VISIT_CODE;
  codes.push(primaryCode);

  if (decision.complaints && decision.complaints.length > 1) {
    const secondary = DIAGNOSIS_MAP[decision.complaints[1]];
    if (secondary && secondary.cpt !== primaryCode.cpt) {
      codes.push(secondary);
    }
  }

  return {
    codes,
    totalExpectedReimbursement: codes.reduce((sum, c) => sum + c.expectedReimbursement, 0),
    primaryDiagnosis: primaryCode.icd10,
    billedAt: new Date().toISOString(),
  };
}

export function getBillingCodes(): Record<string, BillingCode> {
  return DIAGNOSIS_MAP;
}
