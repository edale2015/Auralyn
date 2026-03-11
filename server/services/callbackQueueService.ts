import * as fs from "fs/promises";
import * as path from "path";
import { SkillContext } from "../skills/shared/skillTypes";

const RUNTIME_DIR = path.resolve(process.cwd(), "server/data/runtime");

async function ensureDir() {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
}

export async function enqueueCallbackIfNeeded(context: SkillContext) {
  await ensureDir();

  const outcomeStub = context.priorSkillOutputs?.attach_outcome_stub?.result ?? {};
  if (!outcomeStub.callbackNeeded) {
    return { queued: false };
  }

  const record = {
    callback_id: `CALLBACK_${context.caseId}_${Date.now()}`,
    case_id: context.caseId,
    complaint_id: context.complaintId ?? "",
    follow_up_window_days: outcomeStub.expectedFollowUpWindowDays ?? 3,
    created_at: new Date().toISOString(),
    status: "pending",
  };

  await fs.appendFile(
    path.join(RUNTIME_DIR, "callback_queue.ndjson"),
    JSON.stringify(record) + "\n",
    "utf8"
  );

  return { queued: true, callback_id: record.callback_id };
}
