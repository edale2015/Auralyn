export interface X12Claim {
  claimId: string;
  patientName?: string;
  provider?: string;
  icd10: string;
  cpt: string;
  amount?: string;
  dateOfService?: string;
  npi?: string;
  taxId?: string;
}

export interface X12_837P {
  ISA: { sender: string; receiver: string; date: string; controlNumber: string };
  GS: { type: string; version: string; sender: string };
  ST: { transactionSet: string; claimId: string };
  NM1_patient: { name: string; type: string };
  NM1_provider: { name: string; npi: string };
  HI: { diagnosis: string; qualifier: string };
  SV1: { procedure: string; charge: string; unit: string };
  CLM: { claimId: string; amount: string; facility: string };
  DTP: { dateOfService: string };
}

export function build837P(claim: X12Claim): X12_837P {
  const controlNumber = `${Date.now()}`.slice(-9);

  return {
    ISA: {
      sender: process.env.CLEARINGHOUSE_SENDER_ID || "CLINICALBRAIN",
      receiver: process.env.CLEARINGHOUSE_RECEIVER_ID || "CLEARINGHOUSE",
      date: new Date().toISOString().split("T")[0].replace(/-/g, ""),
      controlNumber,
    },
    GS: {
      type: "HC",
      version: "005010X222A1",
      sender: process.env.CLEARINGHOUSE_SENDER_ID || "CLINICALBRAIN",
    },
    ST: {
      transactionSet: "837",
      claimId: claim.claimId,
    },
    NM1_patient: {
      name: claim.patientName || "PATIENT",
      type: "IL",
    },
    NM1_provider: {
      name: claim.provider || "PROVIDER",
      npi: claim.npi || process.env.PROVIDER_NPI || "0000000000",
    },
    HI: {
      diagnosis: claim.icd10,
      qualifier: "ABK",
    },
    SV1: {
      procedure: claim.cpt,
      charge: claim.amount || "100.00",
      unit: "UN",
    },
    CLM: {
      claimId: claim.claimId,
      amount: claim.amount || "100.00",
      facility: "11",
    },
    DTP: {
      dateOfService: claim.dateOfService || new Date().toISOString().split("T")[0],
    },
  };
}
