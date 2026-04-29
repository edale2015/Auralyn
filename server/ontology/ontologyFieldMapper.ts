/**
 * ontologyFieldMapper.ts
 * server/ontology/ontologyFieldMapper.ts
 *
 * SELF-HEALING FIELD MAPPER
 *
 * When any field in any subsystem uses a non-canonical value, this mapper
 * resolves it to the correct canonical form using the clinical ontology —
 * without requiring code changes across subsystems.
 *
 * Replaces all scattered DISPOSITION_MAP instances in:
 *   - DischargeInstructionPanel.tsx (Win 1)
 *   - CDSSidebarPanel.tsx (Win 2)
 *   - EConsultPanel.tsx (Win 4)
 *   - caseTypeClassifier.ts (Win 7)
 *   - command.routes.ts (Win 10)
 */

import {
  ont,
  resolveDisposition,
  resolveComplaint,
  type DispositionCanonical,
  type DispositionClass,
  type ComplaintClass,
} from "./clinicalOntology";

// ─── Disposition mapping ──────────────────────────────────────────────────────

export const OntologyFieldMapper = {

  disposition(raw: string | undefined | null): DispositionCanonical | null {
    return resolveDisposition(raw)?.canonical ?? null;
  },

  returnPrecautionsKey(raw: string | undefined | null): string {
    return resolveDisposition(raw)?.returnPrecautionsKey ?? "Home Care";
  },

  dispositionLabel(raw: string | undefined | null): string {
    return resolveDisposition(raw)?.label ?? "Unknown";
  },

  dispositionUrgency(raw: string | undefined | null): number {
    return resolveDisposition(raw)?.urgencyLevel ?? 1;
  },

  isAsyncEligible(raw: string | undefined | null): boolean {
    return resolveDisposition(raw)?.constraints.includes("async_review_eligible") ?? false;
  },

  isEConsultEligible(raw: string | undefined | null): boolean {
    return resolveDisposition(raw)?.eConsultEligible ?? false;
  },

  isFollowUpEligible(raw: string | undefined | null): boolean {
    return resolveDisposition(raw)?.followUpEligible ?? false;
  },

  // ── Complaint mapping ─────────────────────────────────────────────────────

  complaintSlug(raw: any): string | null {
    return resolveComplaint(raw)?.canonical ?? null;
  },

  complaintDisplay(raw: any): string {
    return resolveComplaint(raw)?.displayName
      ?? (typeof raw === "string" ? raw.replace(/_/g, " ") : "Unknown");
  },

  isComplaintAsyncSafe(raw: any): boolean {
    return resolveComplaint(raw)?.asyncSafeDefault ?? false;
  },

  hasFollowUpProtocol(raw: any): boolean {
    return resolveComplaint(raw)?.followUpProtocolExists ?? false;
  },

  // ── Full case document normalizer ─────────────────────────────────────────

  enrichCaseDoc<T extends {
    complaint?: any;
    triage?: {
      disposition?: string;
      confidence?:  number;
      topCluster?:  string;
    };
  }>(caseDoc: T): T & {
    _ont: {
      disposition:          DispositionCanonical | null;
      dispositionLabel:     string;
      returnPrecautionsKey: string;
      complaintSlug:        string | null;
      complaintDisplay:     string;
      isAsyncSafe:          boolean;
      isEConsultEligible:   boolean;
      isFollowUpEligible:   boolean;
      hasFollowUpProtocol:  boolean;
      urgencyLevel:         number;
    };
  } {
    const rawDisp = caseDoc.triage?.disposition;
    const rawComp = caseDoc.complaint;

    return {
      ...caseDoc,
      _ont: {
        disposition:          OntologyFieldMapper.disposition(rawDisp),
        dispositionLabel:     OntologyFieldMapper.dispositionLabel(rawDisp),
        returnPrecautionsKey: OntologyFieldMapper.returnPrecautionsKey(rawDisp),
        complaintSlug:        OntologyFieldMapper.complaintSlug(rawComp),
        complaintDisplay:     OntologyFieldMapper.complaintDisplay(rawComp),
        isAsyncSafe:          OntologyFieldMapper.isAsyncEligible(rawDisp),
        isEConsultEligible:   OntologyFieldMapper.isEConsultEligible(rawDisp),
        isFollowUpEligible:   OntologyFieldMapper.isFollowUpEligible(rawDisp),
        hasFollowUpProtocol:  OntologyFieldMapper.hasFollowUpProtocol(rawComp),
        urgencyLevel:         OntologyFieldMapper.dispositionUrgency(rawDisp),
      },
    };
  },

  // ── Semantic passport ─────────────────────────────────────────────────────

  semanticPassport(caseDoc: {
    caseId:    string;
    complaint?: any;
    triage?:   { disposition?: string; confidence?: number };
    source?:   { channel?: string };
  }): {
    caseId:           string;
    ontologyVersion:  string;
    resolvedAt:       string;
    disposition:      DispositionCanonical | null;
    dispositionLabel: string;
    complaintSlug:    string | null;
    urgencyLevel:     number;
    channel:          string;
    validationPassed: boolean;
    semanticClass:    string;
  } {
    const disposition   = OntologyFieldMapper.disposition(caseDoc.triage?.disposition);
    const complaintSlug = OntologyFieldMapper.complaintSlug(caseDoc.complaint);
    const validation    = ont.validateCase(caseDoc as any);
    const urgency       = OntologyFieldMapper.dispositionUrgency(caseDoc.triage?.disposition);

    const semanticClass = [
      complaintSlug ?? "undifferentiated",
      disposition   ?? "unknown_disposition",
      urgency >= 4 ? "HIGH_URGENCY" : urgency >= 3 ? "MODERATE_URGENCY" : "LOW_URGENCY",
    ].join("::");

    return {
      caseId:           caseDoc.caseId,
      ontologyVersion:  "1.0.0",
      resolvedAt:       new Date().toISOString(),
      disposition,
      dispositionLabel: OntologyFieldMapper.dispositionLabel(caseDoc.triage?.disposition),
      complaintSlug,
      urgencyLevel:     urgency,
      channel:          caseDoc.source?.channel ?? "unknown",
      validationPassed: validation.valid,
      semanticClass,
    };
  },
};

// ─── Drop-in replacement helpers ─────────────────────────────────────────────

export function returnPrecautionsKey(raw: string | undefined | null): string {
  return OntologyFieldMapper.returnPrecautionsKey(raw);
}

export function canonicalDisposition(raw: string | undefined | null): DispositionCanonical | null {
  return OntologyFieldMapper.disposition(raw);
}

export function canonicalComplaintSlug(raw: any): string | null {
  return OntologyFieldMapper.complaintSlug(raw);
}
