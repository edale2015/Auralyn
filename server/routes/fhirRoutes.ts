import { Router } from "express";
import bulkExportRouter, { addFHIRResource, buildPatientResource, buildObservationResource, getFHIRDataset } from "../fhir/bulkExport";

const router = Router();

// Mount bulk export sub-router
router.use("/", bulkExportRouter);

// Convenience: ingest a patient
router.post("/patient", (req, res) => {
  try {
    const resource = buildPatientResource(req.body);
    addFHIRResource(resource);
    res.json({ ok: true, resource });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Convenience: ingest an observation
router.post("/observation", (req, res) => {
  try {
    const resource = buildObservationResource(req.body);
    addFHIRResource(resource);
    res.json({ ok: true, resource });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;
