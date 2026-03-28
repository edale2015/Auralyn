import { Router } from "express";
import { auditLog } from "../security/auditLogger";

const router = Router();

const dataset: Array<{ resourceType: string; id: string; [key: string]: any }> = [];

export function addFHIRResource(resource: { resourceType: string; id: string; [key: string]: any }): void {
  // Deduplicate by resourceType+id
  const idx = dataset.findIndex(r => r.resourceType === resource.resourceType && r.id === resource.id);
  if (idx >= 0) { dataset[idx] = resource; }
  else          { dataset.push(resource); }
}

export function getFHIRDataset(): typeof dataset {
  return [...dataset];
}

export function buildPatientResource(patient: {
  id: string;
  name?: string;
  dob?: string;
  gender?: string;
  zip?: string;
}) {
  return {
    resourceType: "Patient",
    id:           patient.id,
    name:         [{ text: patient.name ?? "Unknown" }],
    birthDate:    patient.dob ?? undefined,
    gender:       patient.gender ?? "unknown",
    address:      patient.zip ? [{ postalCode: patient.zip }] : [],
  };
}

export function buildObservationResource(obs: {
  id: string;
  patientId: string;
  code: string;
  display: string;
  value: string | number;
  unit?: string;
}) {
  return {
    resourceType: "Observation",
    id:           obs.id,
    subject:      { reference: `Patient/${obs.patientId}` },
    code:         { coding: [{ system: "http://loinc.org", code: obs.code, display: obs.display }] },
    valueQuantity: typeof obs.value === "number"
      ? { value: obs.value, unit: obs.unit ?? "" }
      : undefined,
    valueString:  typeof obs.value === "string" ? obs.value : undefined,
    effectiveDateTime: new Date().toISOString(),
  };
}

// FHIR $export endpoint (NDJSON-style, returned as JSON array for simplicity)
router.get("/\\$export", (req, res) => {
  auditLog({ actor: "fhir_bulk_export", action: "export_requested", entityType: "bulk", entityId: "all" });

  const resourceType = req.query.resourceType as string | undefined;
  const filtered = resourceType
    ? dataset.filter(r => r.resourceType === resourceType)
    : dataset;

  res.json({
    transactionTime: new Date().toISOString(),
    request:         req.originalUrl,
    requiresAccessToken: false,
    output:          filtered.map(r => ({ type: r.resourceType, url: `/api/fhir/resource/${r.resourceType}/${r.id}` })),
    _resources:      filtered, // inline for dev convenience
    total:           filtered.length,
  });
});

router.get("/resource/:resourceType/:id", (req, res) => {
  const resource = dataset.find(r => r.resourceType === req.params.resourceType && r.id === req.params.id);
  if (!resource) return res.status(404).json({ error: "Resource not found" });
  res.json(resource);
});

router.post("/resource", (req, res) => {
  const resource = req.body;
  if (!resource?.resourceType || !resource?.id) {
    return res.status(400).json({ error: "resourceType and id required" });
  }
  addFHIRResource(resource);
  res.json({ ok: true, id: resource.id });
});

router.get("/summary", (_req, res) => {
  const byType = dataset.reduce((acc, r) => {
    acc[r.resourceType] = (acc[r.resourceType] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  res.json({ total: dataset.length, byType });
});

export default router;
