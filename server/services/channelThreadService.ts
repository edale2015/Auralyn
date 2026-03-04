import { getFirestore } from "../firebase";

function threads() {
  return getFirestore().collection("channel_threads");
}

export async function getActiveCaseId(params: {
  channel: "telegram";
  threadId: string;
}): Promise<string | null> {
  const id = `${params.channel}:${params.threadId}`;
  const snap = await threads().doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  return data?.activeCaseId ?? null;
}

export async function setActiveCaseId(params: {
  channel: "telegram";
  threadId: string;
  activeCaseId: string;
}): Promise<void> {
  const id = `${params.channel}:${params.threadId}`;
  await threads().doc(id).set(
    {
      channel: params.channel,
      threadId: params.threadId,
      activeCaseId: params.activeCaseId,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function clearActiveCaseId(params: {
  channel: "telegram";
  threadId: string;
}): Promise<void> {
  const id = `${params.channel}:${params.threadId}`;
  await threads().doc(id).delete();
}
