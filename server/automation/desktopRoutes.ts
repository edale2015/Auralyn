import { Router } from "express";
import { createDesktopAdapter } from "./desktopAdapter";

const router = Router();

router.post("/execute", async (req, res) => {
  try {
    const adapter = createDesktopAdapter();
    const result = await adapter.execute(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Desktop action failed" });
  }
});

export default router;
