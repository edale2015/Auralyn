import { Router } from "express";
import { listClinicFeatureStates, listLatestClinicHealth } from "../repos/clinicStateRepo";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const clinicId = String(req.query.clinicId || "") || undefined;

    const [features, latestHealth] = await Promise.all([
      listClinicFeatureStates(clinicId),
      listLatestClinicHealth()
    ]);

    const filteredHealth = clinicId
      ? latestHealth.filter((row: any) => row.clinic_id === clinicId)
      : latestHealth;

    res.json({
      clinicId: clinicId || null,
      features,
      health: filteredHealth
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch clinic health" });
  }
});

export default router;
