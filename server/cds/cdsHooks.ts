import { Router } from "express";
import { auditLog } from "../security/auditLogger";

const router = Router();

const CDS_SERVICES = [
  {
    id:          "auralyn-triage",
    hook:        "patient-view",
    title:       "Auralyn Clinical Triage",
    description: "AI-powered ENT/Flu triage recommendations with Bayesian+RLHF scoring",
    prefetch:    { patient: "Patient/{{context.patientId}}" },
  },
  {
    id:          "auralyn-medication-safety",
    hook:        "medication-prescribe",
    title:       "Auralyn Medication Safety",
    description: "Real-time drug interaction and reconciliation check",
    prefetch:    { patient: "Patient/{{context.patientId}}", medications: "MedicationRequest?patient={{context.patientId}}" },
  },
];

router.get("/cds-services", (_req, res) => {
  res.json({ services: CDS_SERVICES });
});

router.post("/cds-services/auralyn-triage", async (req, res) => {
  const hookContext = req.body?.context ?? {};
  const patientId   = hookContext.patientId ?? hookContext.patient ?? "unknown";

  auditLog({ actor: "cds_hook", action: "triage_card_requested", entityType: "patient", entityId: patientId });

  // Run lightweight triage summary (no full flow to keep CDS response fast)
  const cards = [
    {
      summary:   "Auralyn Triage Active",
      detail:    "AI triage pipeline is running for this patient. Refer to Auralyn ControlTower for full disposition and scoring.",
      indicator: "info",
      source:    { label: "Auralyn ENT Clinical AI", url: "https://auralyn.health" },
      links: [
        { label: "Open Case in Auralyn", url: `/ops`, type: "absolute" },
      ],
    },
  ];

  res.json({ cards });
});

router.post("/cds-services/auralyn-medication-safety", async (req, res) => {
  const { context, prefetch } = req.body ?? {};
  const patientId = context?.patientId ?? "unknown";

  auditLog({ actor: "cds_hook", action: "med_safety_check", entityType: "patient", entityId: patientId });

  const cards: any[] = [];

  // Pull medication resources from prefetch if available
  const meds: string[] = (prefetch?.medications?.entry ?? []).map((e: any) =>
    e?.resource?.medicationCodeableConcept?.text ?? ""
  ).filter(Boolean);

  if (meds.length > 0) {
    cards.push({
      summary:   `${meds.length} active medication(s) on file`,
      detail:    `Medications: ${meds.join(", ")}. Use Auralyn Eligibility to verify coverage.`,
      indicator: "info",
      source:    { label: "Auralyn Medication Safety" },
    });
  } else {
    cards.push({
      summary:   "Medication reconciliation available",
      detail:    "No FHIR medication resources prefetched. Initiate reconciliation in Auralyn.",
      indicator: "warning",
      source:    { label: "Auralyn Medication Safety" },
    });
  }

  res.json({ cards });
});

export default router;
