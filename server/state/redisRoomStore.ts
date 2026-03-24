import { getRedisClient } from "../redis/redisClient";
import { publish } from "../ws/pubsub";

export interface Room {
  caseId: string;
  status: "active" | "pending_review" | "waiting" | "escalated" | "complete";
  riskScore: number;
  physicianId?: string;
  updatedAt: string;
  [key: string]: unknown;
}

const memoryRooms: Map<string, Room> = new Map();

export async function saveRoom(room: Room): Promise<void> {
  memoryRooms.set(room.caseId, room);

  const redis = await getRedisClient();
  if (redis) {
    try {
      await redis.set(`room:${room.caseId}`, JSON.stringify(room), "EX", 86400);
    } catch (e: any) {
      console.warn(`[RedisRoomStore] Redis write failed for room ${room.caseId}: ${e?.message}`);
    }
  }

  await publish("rooms", room).catch(() => {});
}

export async function getRoom(caseId: string): Promise<Room | null> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(`room:${caseId}`);
      if (raw) return JSON.parse(raw) as Room;
    } catch {}
  }
  return memoryRooms.get(caseId) ?? null;
}

export async function getAllRooms(): Promise<Room[]> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      const keys = await redis.keys("room:*");
      if (keys.length > 0) {
        const raw = await redis.mget(...keys);
        return raw
          .filter(Boolean)
          .map((d) => JSON.parse(d as string) as Room);
      }
    } catch (e: any) {
      console.warn(`[RedisRoomStore] Redis read all failed: ${e?.message}`);
    }
  }
  return Array.from(memoryRooms.values());
}

export async function deleteRoom(caseId: string): Promise<void> {
  memoryRooms.delete(caseId);
  const redis = await getRedisClient();
  if (redis) {
    try {
      await redis.del(`room:${caseId}`);
    } catch {}
  }
}
