import { Router, Request, Response } from "express";
import { startIntake, submitIntakeStep } from "./intakeService";

export function makeIntakeRoutes(
  runFullClinicalFlow: (payload: any) => Promise<any>
): Router {
  const router = Router();

  router.post("/start", async (req: Request, res: Response) => {
    const clinicExternalId = (req.headers["x-clinic-id"] as string) || req.body.clinicId || "default";
    try {
      const session = await startIntake(clinicExternalId, req.body);
      return res.json({ ok: true, session });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to start intake",
      });
    }
  });

  router.post("/submit-step", async (req: Request, res: Response) => {
    const clinicExternalId = (req.headers["x-clinic-id"] as string) || req.body.clinicId || "default";
    try {
      const result = await submitIntakeStep(clinicExternalId, req.body, runFullClinicalFlow);
      return res.json({ ok: true, ...result });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to process intake step",
      });
    }
  });

  return router;
}
