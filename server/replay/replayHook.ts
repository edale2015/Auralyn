import { logReplay } from "../memory/hybridMemory";
import { logClinicalCase } from "../memory/memoryIngest";

export interface ReplayHookInput {
  replayId: string;
  templateId: string;
  versionId?: string;
  status: "completed" | "failed" | "cancelled";
  stepCount?: number;
  failedStepId?: string;
  patientId?: string;
  embedding?: number[];
}

export async function hookReplayToMemory(input: ReplayHookInput): Promise<string> {
  const node = await logReplay({
    replayId: input.replayId,
    templateId: input.templateId,
    status: input.status,
    embedding: input.embedding,
  });

  if (input.patientId && input.status === "completed") {
    logClinicalCase({
      patientId: input.patientId,
      complaints: [],
      triage: "routine",
      riskScore: 0.2,
      recommendedActions: [`template:${input.templateId}`],
      outcome: "unknown",
    });
  }

  return node.id;
}

export async function batchHookReplays(replays: ReplayHookInput[]): Promise<string[]> {
  const ids: string[] = [];
  for (const r of replays) {
    const id = await hookReplayToMemory(r);
    ids.push(id);
  }
  return ids;
}
