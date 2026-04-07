/**
 * Packet 14 — Learning Loop: fix types
 *
 * ProposedFix is the immutable, governed unit of change that flows from
 * test failure → governance gate → versioned apply.
 *
 * Rules:
 *   • autoApprove is always false for clinical fixes — enforced in fixGenerator.
 *   • "clinical" category fixes ALWAYS require physician review before apply.
 *   • "performance" category fixes MAY be reviewed by engineering only.
 */

export type FixType =
  | "adjust_prior"
  | "add_feature_likelihood"
  | "adjust_threshold"
  | "add_red_flag"
  | "adjust_parser_rule";

export type FixCategory = "clinical" | "performance";

export interface ProposedFix {
  id: string;

  type: FixType;

  target: {
    complaint: string;
    diagnosis?: string;
    parameter?: string;
  };

  change: {
    from?: any;
    to: any;
  };

  reason: string;

  sourceSignalId: string;

  category: FixCategory;

  /**
   * ALWAYS false for clinical fixes. Enforced by fixGenerator and
   * the governance gate — never set this to true for clinical changes.
   */
  autoApprove: false;
}

// ── AuditLinkage ──────────────────────────────────────────────────────────────
// Every applied fix must carry a full lineage record for FDA Part 11 compliance.

export interface FixAuditLinkage {
  fixId: string;
  sourceSignalId: string;
  testCaseId: string;
  appliedAt: string;
  reviewerId: string;
}
