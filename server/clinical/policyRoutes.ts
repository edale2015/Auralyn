import { Router } from "express";
import { getPolicy, setPolicy, getAllPolicies, getPoliciesForContext, isPolicyEnabled } from "./policyEngine";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ ok: true, policies: getAllPolicies() });
});

router.get("/context", (req, res) => {
  const { region, payer } = req.query as Record<string, string | undefined>;
  res.json({ ok: true, policies: getPoliciesForContext({ region, payer }) });
});

router.get("/:key", (req, res) => {
  const policy  = getPolicy(req.params.key);
  const enabled = isPolicyEnabled(req.params.key);
  res.json({ ok: true, policy, enabled });
});

router.put("/:key", (req, res) => {
  try {
    const { enabled, params } = req.body ?? {};
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ ok: false, error: "enabled (boolean) required" });
    }
    const updated = setPolicy(req.params.key, enabled, params);
    res.json({ ok: true, policy: updated });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
