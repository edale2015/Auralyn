import express from "express";
import { upsertRoom, getRoom, deleteRoom, getAllRooms, getRoomsByStatus, getRoomSummary } from "../orchestration/roomManager";

const router = express.Router();

router.get("/rooms", (_req, res) => {
  res.json({ ok: true, rooms: getAllRooms(), summary: getRoomSummary() });
});

router.get("/rooms/summary", (_req, res) => {
  res.json({ ok: true, summary: getRoomSummary() });
});

router.get("/rooms/status/:status", (req, res) => {
  const rooms = getRoomsByStatus(req.params.status as any);
  res.json({ ok: true, rooms, count: rooms.length });
});

router.get("/rooms/:caseId", (req, res) => {
  const room = getRoom(req.params.caseId);
  if (!room) return res.status(404).json({ ok: false, error: "Room not found" });
  res.json({ ok: true, room });
});

router.post("/rooms/:caseId", (req, res) => {
  const room = upsertRoom(req.params.caseId, req.body);
  res.json({ ok: true, room });
});

router.delete("/rooms/:caseId", (req, res) => {
  const deleted = deleteRoom(req.params.caseId);
  res.json({ ok: deleted, caseId: req.params.caseId });
});

export default router;
