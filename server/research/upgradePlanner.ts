/**
 * server/research/upgradePlanner.ts
 * Upgrade Planner Agent — translates article findings into concrete code proposals.
 *
 * For each article that passes triage, the planner:
 *   1. Pattern-matches content to known Auralyn subsystems
 *   2. Generates a patch bundle (file → content stubs with TODO markers)
 *   3. Produces a validation plan anchored to our existing safety gates
 *   4. Creates a proposedUpgrades record (approval-gated, never auto-applied)
 *
 * SAFETY CONTRACT: the planner only PROPOSES changes. It NEVER writes to the
 * live codebase. Changes only reach production after:
 *   human approval → validation pass → GitHub PR → branch protection merge.
 */

import { db } from "../db";
import { proposedUpgrades, researchArticles } from "../../shared/schema";
import { eq } from "drizzle-orm";

type UpgradePlan = {
  upgradeTitle:  string;
  rationale:     string;
  affectedFiles: string[];
  patchBundle:   Record<string, string>;
  validationPlan: string[];
};

// ── Clinical topic → upgrade mapping ─────────────────────────────────────────

const UPGRADE_RULES: Array<{
  keywords: string[];
  plan: UpgradePlan;
}> = [
  {
    keywords: ["calibration", "reliability diagram", "brier score", "expected calibration"],
    plan: {
      upgradeTitle: "Calibration monitor enhancement",
      rationale:    "Article suggests techniques relevant to confidence alignment and overconfidence detection.",
      affectedFiles: ["server/validation/calibrationMonitor.ts", "server/routes/validationRoutes.ts"],
      patchBundle: {
        "server/validation/calibrationMonitor.ts":
          `// TODO (research-upgrade): add expected calibration error buckets and complaint-level slices\n` +
          `// Reference article tagged: calibration / reliability\n`,
      },
      validationPlan: [
        "Run full golden case harness before and after change.",
        "Compare Brier score and unsafe undercall rate.",
        "Block merge if unsafe undercalls increase by any amount.",
        "Verify calibration error < 0.05 across all complaint categories.",
      ],
    },
  },
  {
    keywords: ["fhir", "hl7", "smart on fhir", "epic", "athena", "ehr integration"],
    plan: {
      upgradeTitle: "FHIR adapter hardening",
      rationale:    "Article appears relevant to EHR interoperability and FHIR R4 integration patterns.",
      affectedFiles: ["server/ehr/fhir/fhirClient.ts", "server/ehr/fhir/fhirAuth.ts", "server/ehr/fhir/fhirRoutes.ts"],
      patchBundle: {
        "server/ehr/fhir/fhirClient.ts":
          `// TODO (research-upgrade): add configurable retry policy with exponential backoff\n` +
          `// TODO (research-upgrade): add per-request audit log entry on FHIR write\n`,
      },
      validationPlan: [
        "Run FHIR sandbox integration tests.",
        "Verify no change to core disposition logic or safety gates.",
        "Confirm token cache per-tenant isolation is preserved.",
        "Test sync-encounter with mock Epic and Athena endpoints.",
      ],
    },
  },
  {
    keywords: ["sepsis", "early warning", "qsofa", "news2", "sirs criteria", "septic shock"],
    plan: {
      upgradeTitle: "Sepsis detection threshold refinement",
      rationale:    "Article contains clinical evidence that may improve sepsis/shock early warning thresholds.",
      affectedFiles: ["server/prediction/deteriorationEngine.ts", "server/ai/bayesianNetwork.ts"],
      patchBundle: {
        "server/prediction/deteriorationEngine.ts":
          `// TODO (research-upgrade): review threshold values in computeDeteriorationRisk()\n` +
          `// Proposed: adjust fever threshold per article evidence (currently 38.3°C)\n`,
      },
      validationPlan: [
        "Run full sepsis golden cases before and after threshold change.",
        "UNSAFE UNDERCALLS MUST REMAIN ZERO — no exceptions.",
        "Run adversarial test: borderline sepsis cases that previously triggered alert must still trigger.",
        "Physician review of any threshold change required before merge.",
      ],
    },
  },
  {
    keywords: ["bayesian", "posterior", "prior", "conditional probability", "inference"],
    plan: {
      upgradeTitle: "Bayesian network CPT refinement",
      rationale:    "Article may contain evidence-based probability updates relevant to clinical Bayesian networks.",
      affectedFiles: ["server/ai/bayesianNetwork.ts", "server/clinical/bayesianEngine.ts"],
      patchBundle: {
        "server/ai/bayesianNetwork.ts":
          `// TODO (research-upgrade): review CPT values in sepsisNetwork and acsNetwork\n` +
          `// Any CPT change requires validation against golden case set\n`,
      },
      validationPlan: [
        "Compare posterior outputs before and after CPT change.",
        "Flag any case where high-risk patient drops to lower risk tier.",
        "Run adversarial cases: known sepsis/ACS/PE presentations.",
        "Require physician sign-off on any CPT update.",
      ],
    },
  },
  {
    keywords: ["hallucination", "factual grounding", "safety guard", "output filter", "refusal"],
    plan: {
      upgradeTitle: "Hallucination guard hardening",
      rationale:    "Article discusses LLM hallucination mitigation relevant to our clinical RAG and copilot layer.",
      affectedFiles: ["server/clinical/hallucinationExtensions.ts", "server/clinical/safetyGate.ts"],
      patchBundle: {
        "server/clinical/hallucinationExtensions.ts":
          `// TODO (research-upgrade): review detection patterns against article techniques\n` +
          `// Consider: semantic similarity threshold, factual consistency check\n`,
      },
      validationPlan: [
        "Run hallucination red-team cases: deliberately wrong drug doses, incorrect diagnoses.",
        "Verify all flagged outputs still route to physician review.",
        "Check that refusal rate does not increase for valid clinical queries.",
      ],
    },
  },
  {
    keywords: ["fda", "510k", "samd", "software as a medical device", "clinical trial"],
    plan: {
      upgradeTitle: "FDA audit chain enhancement",
      rationale:    "Article discusses regulatory compliance patterns relevant to SaMD submission.",
      affectedFiles: ["server/fda/fdaAuditChain.ts", "server/routes/fdaAuditRoutes.ts"],
      patchBundle: {
        "server/fda/fdaAuditChain.ts":
          `// TODO (research-upgrade): review audit event types against FDA SaMD guidance\n`,
      },
      validationPlan: [
        "Verify audit chain captures all decision-relevant events.",
        "Run end-to-end audit export and confirm completeness.",
        "Test Part 11 compliance requirements.",
      ],
    },
  },
];

// ── Planner ───────────────────────────────────────────────────────────────────

function planFromContent(title: string, excerpt: string | null): UpgradePlan {
  const text = `${title} ${excerpt ?? ""}`.toLowerCase();

  for (const rule of UPGRADE_RULES) {
    if (rule.keywords.some(k => text.includes(k))) {
      return rule.plan;
    }
  }

  // Default: requires manual review
  return {
    upgradeTitle: "Research-derived review item",
    rationale:    "Article is potentially interesting but not specific enough for direct production changes.",
    affectedFiles: ["server/research/upgradePlanner.ts"],
    patchBundle:   {},
    validationPlan: [
      "Manual physician + engineering review required.",
      "Convert to test-only item unless specific implementation evidence is found.",
      "Do not merge without validation harness coverage.",
    ],
  };
}

export async function proposeUpgrade(articleId: number) {
  const rows = await db.select().from(researchArticles).where(eq(researchArticles.id, articleId));
  const article = rows[0];
  if (!article) throw new Error(`Article ${articleId} not found`);

  const plan = planFromContent(article.title, article.excerpt);

  const inserted = await db
    .insert(proposedUpgrades)
    .values({
      articleId,
      title:                 plan.upgradeTitle,
      rationale:             plan.rationale,
      affectedFiles:         plan.affectedFiles,
      patchBundle:           plan.patchBundle,
      validationPlan:        plan.validationPlan,
      validationStatus:      "pending",
      requiresHumanApproval: true,
      approved:              false,
    })
    .returning();

  return inserted[0];
}
