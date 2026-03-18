import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import {
  signBoardPayload,
  verifyBoardSignature,
} from "../services/signedBoardExports";

const router = Router();
const auth = requireRole(["admin"]);

router.post("/json", auth, (req: Request, res: Response) => {
  res.json(signBoardPayload(req.body));
});

router.post("/verify", auth, (req: Request, res: Response) => {
  const ok = verifyBoardSignature(req.body.payload, req.body.signature);
  res.json({ valid: ok });
});

export default router;
