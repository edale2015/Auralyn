import { z } from "zod";

export const CanonicalPathwayPromotionSchema = z.object({
  sourceType: z.enum(["complaint_pack", "golden_case", "manual"]),
  complaintId: z.string().min(1),
  syndromeId: z.string().min(1),
  label: z.string().min(1).max(200),
  requiredFeatures: z.array(z.string()).default([]),
  positiveWeights: z.record(z.string(), z.number()).default({}),
  negativeWeights: z.record(z.string(), z.number()).default({}),
  exclusions: z.array(z.string()).default([]),
  treatmentClass: z.enum([
    "none",
    "supportive",
    "antibiotic",
    "antiviral",
    "steroid",
    "bronchodilator",
    "topical",
    "antifungal",
  ]),
  medicationKey: z.string().optional(),
  canonicalDisposition: z.enum([
    "home_supportive_care",
    "home_with_rx",
    "follow_up_primary_care",
    "same_day_urgent_care",
    "er_now",
    "hospital_admission",
  ]),
  rationale: z.array(z.string()).default([]),
  actorId: z.string().min(1),
  traceId: z.string().min(1),
});

export const CanonicalPathwayRetireSchema = z.object({
  pathwayId: z.string().min(1),
  actorId: z.string().min(1),
  traceId: z.string().min(1),
  reason: z.string().min(3),
});

export const CanonicalDraftFromCaseSchema = z.object({
  complaint: z.string().min(1),
  features: z.record(z.string(), z.any()),
  expectedDisposition: z.string().optional(),
  actorId: z.string().min(1),
  traceId: z.string().min(1),
});

export type CanonicalPathwayPromotionInput = z.infer<typeof CanonicalPathwayPromotionSchema>;
export type CanonicalPathwayRetireInput   = z.infer<typeof CanonicalPathwayRetireSchema>;
export type CanonicalDraftFromCaseInput   = z.infer<typeof CanonicalDraftFromCaseSchema>;
