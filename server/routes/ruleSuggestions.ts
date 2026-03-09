import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { ruleSuggestionStore } from "../services/ruleSuggestionStore";
import type { SuggestionStatus, SuggestionType } from "../services/ruleSuggestionStore";

export const ruleSuggestionsRouter = Router();

const VALID_TYPES: SuggestionType[] = [
  "promote_question",
  "add_red_flag",
  "strengthen_threshold",
  "increase_dx_support",
  "add_trigger",
];

const VALID_STATUSES: SuggestionStatus[] = ["pending", "accepted", "rejected", "postponed"];

ruleSuggestionsRouter.post("/", requireRole(["admin"]), async (req, res) => {
  try {
    const { complaintId, type, description, rationale } = req.body;
    if (!complaintId || !type || !description || !rationale) {
      res.status(400).json({ error: "complaintId, type, description, and rationale are required" });
      return;
    }
    if (!VALID_TYPES.includes(type)) {
      res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` });
      return;
    }
    const suggestion = await ruleSuggestionStore.create({ complaintId, type, description, rationale });
    res.json(suggestion);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create suggestion" });
  }
});

ruleSuggestionsRouter.get("/", requireRole(["admin"]), async (req, res) => {
  try {
    const complaintId = req.query.complaintId as string | undefined;
    const suggestions = await ruleSuggestionStore.list(complaintId);
    res.json({ suggestions });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to list suggestions" });
  }
});

ruleSuggestionsRouter.patch("/:id", requireRole(["admin"]), async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
      return;
    }
    const updated = await ruleSuggestionStore.updateStatus(req.params.id, status);
    if (!updated) {
      res.status(404).json({ error: "Suggestion not found" });
      return;
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update suggestion" });
  }
});
