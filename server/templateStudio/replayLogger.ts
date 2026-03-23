import crypto from "crypto";
import { ReplayRepository } from "./replayRepository";
import type { ReplaySession, ReplayStepRecord } from "../../shared/replayInspector";

export class ReplayLogger {
  constructor(private repo: ReplayRepository) {}

  async startSession(input: {
    templateId: string;
    versionId: string;
    initiatedBy: string;
    environment: string;
  }): Promise<ReplaySession> {
    const session: ReplaySession = {
      replayId: crypto.randomUUID(),
      templateId: input.templateId,
      versionId: input.versionId,
      startedAt: new Date().toISOString(),
      status: "running",
      initiatedBy: input.initiatedBy,
      environment: input.environment,
      stepRecords: [],
    };
    await this.repo.save(session);
    return session;
  }

  async appendStep(replayId: string, record: ReplayStepRecord) {
    const session = await this.repo.get(replayId);
    if (!session) throw new Error("Replay session not found");
    session.stepRecords.push(record);
    await this.repo.save(session);
  }

  async complete(replayId: string, status: ReplaySession["status"]) {
    const session = await this.repo.get(replayId);
    if (!session) throw new Error("Replay session not found");
    session.status = status;
    session.finishedAt = new Date().toISOString();
    await this.repo.save(session);
  }
}
