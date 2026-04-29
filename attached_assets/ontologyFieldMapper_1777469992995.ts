/**
 * ontologyFieldMapper.ts
 * Drop into: server/ontology/ontologyFieldMapper.ts
 *
 * SELF-HEALING FIELD MAPPER
 *
 * This is the production implementation of the article's self-healing agent pattern.
 * When any field in any subsystem uses a non-canonical value, this mapper resolves it
 * to the correct canonical form using the clinical ontology — without requiring
 * code changes across subsystems.
 *
 * THE PROBLEM IT REPLACES:
 * Currently scattered across the codebase:
 *   - DISPOSITION_MAP in DischargeInstructionPanel.tsx (Win 1)
 *   - DISPOSITION_MAP in CDSSidebarPanel.tsx (Win 2)
 *   - translateDisposition() in EConsultPanel.tsx (Win 4)
 *   - DISPOSITION_MAP in caseTypeClassifier.ts (Win 7)
 *   - disposition translation in command.routes.ts (Win 10)
 *
 * Each of these is a separate DISPOSITION_MAP. They are all the same function.
 * They will all drift apart as the system grows.
 *
 * THE ONTOLOGY FIX:
 * One canonical mapper that every subsystem imports.
 * When a new disposition alias is added to the clinical ontology,
 * all subsystems get it automatically — zero code changes required.
 *
 * USAGE:
 *   import { OntologyFieldMapper } from "../ontology/ontologyFieldMapper";
 *
 *   // Anywhere in the codebase:
 *   const canonical = OntologyFieldMapper.disposition("er_send");
 *   // → "ER_SEND"
 *
 *   const label = OntologyFieldMapper.dispositionLabel("pcp");
 *   // → "Prescription"  (the RETURN_PRECAUTIONS key)
 *
 *   const enriched = OntologyFieldMapper.enrichCaseDoc(rawCaseDoc);
 *   // → rawCaseDoc with all fields normalized to canonical forms
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

  /**
   * Resolve any disposition string to its canonical form.
   * Replaces all DISPOSITION_MAP instances across the codebase.
   *
   * @returns canonical DispositionCanonical or null if unresolvable
   */
  disposition(raw: string | undefined | null): DispositionCanonical | null {
    const resolved = resolveDisposition(raw);
    return resolved?.canonical ?? null;
  },

  /**
   * Get the RETURN_PRECAUTIONS map key for any disposition.
   * Replaces: DISPOSITION_MAP["pcp"] → "Prescription" pattern in Win 1, 2, 4.
   */
  returnPrecautionsKey(raw: string | undefined | null): string {
    const resolved = resolveDisposition(raw);
    return resolved?.returnPrecautionsKey ?? "Home Care";
  },

  /**
   * Get the human display label for any disposition.
   */
  dispositionLabel(raw: string | undefined | null): string {
    const resolved = resolveDisposition(raw);
    return resolved?.label ?? "Unknown";
  },

  /**
   * Get the urgency level (1-5) for any disposition.
   */
  dispositionUrgency(raw: string | undefined | null): number {
    const resolved = resolveDisposition(raw);
    return resolved?.urgencyLevel ?? 1;
  },

  /**
   * Check if this disposition is eligible for async review.
   */
  isAsyncEligible(raw: string | undefined | null): boolean {
    const resolved = resolveDisposition(raw);
    return resolved?.constraints.includes("async_review_eligible") ?? false;
  },

  /**
   * Check if this disposition requires the eConsult panel.
   */
  isEConsultEligible(raw: string | undefined | null): boolean {
    const resolved = resolveDisposition(raw);
    return resolved?.eConsultEligible ?? false;
  },

  /**
   * Check if this disposition is eligible for follow-up enrollment (Win 8).
   */
  isFollowUpEligible(raw: string | undefined | null): boolean {
    const resolved = resolveDisposition(raw);
    return resolved?.followUpEligible ?? false;
  },

  // ── Complaint mapping ─────────────────────────────────────────────────────

  /**
   * Resolve any complaint to its canonical slug.
   * Handles: string slugs, { slug, display } objects, display strings.
   */
  complaintSlug(raw: any): string | null {
    const resolved = resolveComplaint(raw);
    return resolved?.canonical ?? null;
  },

  /**
   * Get the display name for any complaint.
   */
  complaintDisplay(raw: any): string {
    const resolved = resolveComplaint(raw);
    return resolved?.displayName ?? (typeof raw === "string" ? raw.replace(/_/g, " ") : "Unknown");
  },

  /**
   * Check if a complaint is async-safe by default.
   */
  isComplaintAsyncSafe(raw: any): boolean {
    const resolved = resolveComplaint(raw);
    return resolved?.asyncSafeDefault ?? false;
  },

  /**
   * Check if a follow-up protocol exists for this complaint (Win 8).
   */
  hasFollowUpProtocol(raw: any): boolean {
    const resolved = resolveComplaint(raw);
    return resolved?.followUpProtocolExists ?? false;
  },

  // ── Full case document normalizer ─────────────────────────────────────────

  /**
   * Enrich a raw CaseDoc with ontology-resolved canonical fields.
   * Call this once at case ingestion — all downstream consumers get clean data.
   *
   * This is the "self-healing" pattern from the article:
   * instead of every subsystem translating dispositions independently,
   * the ontology resolves them once at ingestion.
   */
  enrichCaseDoc<T extends {
    complaint?:   any;
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
    const rawDisp    = caseDoc.triage?.disposition;
    const rawComp    = caseDoc.complaint;

    const disposition          = OntologyFieldMapper.disposition(rawDisp);
    const dispositionLabel     = OntologyFieldMapper.dispositionLabel(rawDisp);
    const returnPrecautionsKey = OntologyFieldMapper.returnPrecautionsKey(rawDisp);
    const complaintSlug        = OntologyFieldMapper.complaintSlug(rawComp);
    const complaintDisplay     = OntologyFieldMapper.complaintDisplay(rawComp);
    const urgencyLevel         = OntologyFieldMapper.dispositionUrgency(rawDisp);

    return {
      ...caseDoc,
      _ont: {
        disposition,
        dispositionLabel,
        returnPrecautionsKey,
        complaintSlug,
        complaintDisplay,
        isAsyncSafe:         OntologyFieldMapper.isAsyncEligible(rawDisp),
        isEConsultEligible:  OntologyFieldMapper.isEConsultEligible(rawDisp),
        isFollowUpEligible:  OntologyFieldMapper.isFollowUpEligible(rawDisp),
        hasFollowUpProtocol: OntologyFieldMapper.hasFollowUpProtocol(rawComp),
        urgencyLevel,
      },
    };
  },

  // ── Cross-subsystem semantic contract ─────────────────────────────────────

  /**
   * Generate a "semantic passport" for a case — the metadata block
   * that travels with the case across all Auralyn subsystems.
   *
   * Inspired by the article's A2A _mesh_metadata pattern:
   * every cross-agent hop carries its semantic classification.
   */
  semanticPassport(caseDoc: {
    caseId:    string;
    complaint?: any;
    triage?:   { disposition?: string; confidence?: number };
    source?:   { channel?: string };
  }): {
    caseId:              string;
    ontologyVersion:     string;
    resolvedAt:          string;
    disposition:         DispositionCanonical | null;
    dispositionLabel:    string;
    complaintSlug:       string | null;
    urgencyLevel:        number;
    channel:             string;
    validationPassed:    boolean;
    semanticClass:       string;   // human-readable classification
  } {
    const disposition   = OntologyFieldMapper.disposition(caseDoc.triage?.disposition);
    const complaintSlug = OntologyFieldMapper.complaintSlug(caseDoc.complaint);
    const validation    = ont.validateCase(caseDoc as any);
    const urgency       = OntologyFieldMapper.dispositionUrgency(caseDoc.triage?.disposition);

    const semanticClass = [
      complaintSlug ?? "undifferentiated",
      disposition ?? "unknown_disposition",
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

// ─── Migration helpers ────────────────────────────────────────────────────────
// Use these to remove the scattered DISPOSITION_MAP instances from the codebase.
// Each function is a drop-in replacement for the existing translation pattern.

/**
 * Drop-in replacement for all DISPOSITION_MAP["x"] → "Y" usages.
 *
 * BEFORE (in DischargeInstructionPanel, CDSSidebarPanel, EConsultPanel, etc.):
 *   const DISPOSITION_MAP: Record<string, string> = {
 *     er_send: "Urgent Care", urgent_care: "Urgent Care",
 *     pcp: "Prescription", self_care: "Home Care",
 *   };
 *   disposition: DISPOSITION_MAP[rawDisp] ?? "Home Care"
 *
 * AFTER:
 *   import { returnPrecautionsKey } from "../ontology/ontologyFieldMapper";
 *   disposition: returnPrecautionsKey(rawDisp)
 */
export function returnPrecautionsKey(raw: string | undefined | null): string {
  return OntologyFieldMapper.returnPrecautionsKey(raw);
}

export function canonicalDisposition(raw: string | undefined | null): DispositionCanonical | null {
  return OntologyFieldMapper.disposition(raw);
}

export function canonicalComplaintSlug(raw: any): string | null {
  return OntologyFieldMapper.complaintSlug(raw);
}
