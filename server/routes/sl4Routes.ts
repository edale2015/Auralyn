import { Router } from "express";
import { listProviders, getProvider, getProviderSummary } from "../sl4/providerPerformanceService";

const router = Router();

router.get("/api/sl4/providers", (_req, res) => {
  res.json({ providers: listProviders(), summary: getProviderSummary() });
});

router.get("/api/sl4/providers/summary", (_req, res) => {
  res.json(getProviderSummary());
});

router.get("/api/sl4/providers/:id", (req, res) => {
  const provider = getProvider(req.params.id);
  if (!provider) return res.status(404).json({ error: "Provider not found" });
  res.json(provider);
});

export default router;
