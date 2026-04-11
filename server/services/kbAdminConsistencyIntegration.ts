import { v4 as uuidv4 } from "uuid";
import type { Request, Response } from "express";
import {
  CanonicalDraftFromCaseSchema,
  CanonicalPathwayPromotionSchema,
  CanonicalPathwayRetireSchema,
} from "../kb/schemas/kbValidationSchemas";
import { createCanonicalPathway, retireCanonicalPathway, listCanonicalPathways } from "../kb/services/kbWriteService";
import { runClinicalConsistencyEngine } from "./clinicalConsistencyEngine";

export async function previewCanonicalPromotionHandler(req: Request, res: Response) {
  const parsed = CanonicalPathwayPromotionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const body = parsed.data;
  const existing = await listCanonicalPathways(body.complaintId, true);
  const conflict = existing.find((p) => p.syndrome_id === body.syndromeId);

  return res.json({
    ok: true,
    preview: {
      complaintId: body.complaintId,
      syndromeId: body.syndromeId,
      label: body.label,
      canonicalDisposition: body.canonicalDisposition,
      treatmentClass: body.treatmentClass,
      requiredFeaturesCount: body.requiredFeatures.length,
      positiveFeatureCount: Object.keys(body.positiveWeights).length,
      negativeFeatureCount: Object.keys(body.negativeWeights).length,
      wouldCreate: !conflict,
      wouldConflictWith: conflict ? conflict.pathway_id : null,
    },
  });
}

export async function promoteCanonicalPathwayHandler(req: Request, res: Response) {
  const parsed = CanonicalPathwayPromotionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const body = parsed.data;

  try {
    const result = await createCanonicalPathway(
      {
        pathwayId: uuidv4(),
        sourceType: body.sourceType,
        complaintId: body.complaintId,
        syndromeId: body.syndromeId,
        label: body.label,
        requiredFeatures: body.requiredFeatures,
        positiveWeights: body.positiveWeights,
        negativeWeights: body.negativeWeights,
        exclusions: body.exclusions,
        treatmentClass: body.treatmentClass,
        medicationKey: body.medicationKey,
        canonicalDisposition: body.canonicalDisposition,
        rationale: body.rationale,
      },
      body.actorId,
      body.traceId
    );
    return res.json({ ok: true, result });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message ?? "Failed to promote pathway" });
  }
}

export async function retireCanonicalPathwayHandler(req: Request, res: Response) {
  const parsed = CanonicalPathwayRetireSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const { pathwayId, actorId, traceId, reason } = parsed.data;

  try {
    const result = await retireCanonicalPathway(pathwayId, actorId, traceId, reason);
    return res.json({ ok: true, result });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message ?? "Failed to retire pathway" });
  }
}

export async function generateCanonicalDraftFromCaseHandler(req: Request, res: Response) {
  const parsed = CanonicalDraftFromCaseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const body = parsed.data;
  const canonical = runClinicalConsistencyEngine(body.complaint, body.features);

  return res.json({
    ok: true,
    draft: {
      sourceType: "golden_case",
      complaintId: body.complaint,
      syndromeId: canonical.winningSyndrome?.syndromeId ?? "undifferentiated",
      label: canonical.winningSyndrome?.label ?? "Undifferentiated phenotype",
      requiredFeatures: Object.entries(body.features)
        .filter(([, v]) => v === true)
        .map(([k]) => k),
      positiveWeights: {},
      negativeWeights: {},
      exclusions: [],
      treatmentClass: canonical.treatment.class,
      medicationKey: canonical.treatment.medicationKey,
      canonicalDisposition: canonical.disposition.disposition,
      rationale: canonical.notesForClinician,
    },
    canonical,
  });
}
