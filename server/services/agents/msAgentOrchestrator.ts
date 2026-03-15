import { setMemory } from "./msAgentMemory";

export interface MsAgentStep {
  agentId: string;
  action: string;
  input: unknown;
  output?: unknown;
  timestamp: string;
}

export interface MsAgentSession {
  sessionId: string;
  steps: MsAgentStep[];
  status: "active" | "completed" | "failed";
  createdAt: string;
}

const sessions = new Map<string, MsAgentSession>();

export function createSession(): MsAgentSession {
  const session: MsAgentSession = {
    sessionId: `ms_session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    steps: [],
    status: "active",
    createdAt: new Date().toISOString(),
  };
  sessions.set(session.sessionId, session);
  return session;
}

export function addStep(sessionId: string, step: Omit<MsAgentStep, "timestamp">): MsAgentSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.steps.push({ ...step, timestamp: new Date().toISOString() });
  setMemory(`session:${sessionId}:lastStep`, step);
  return session;
}

export function completeSession(sessionId: string): MsAgentSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.status = "completed";
  return session;
}

export function getSession(sessionId: string): MsAgentSession | undefined { return sessions.get(sessionId); }
export function listSessions(): MsAgentSession[] { return Array.from(sessions.values()).reverse(); }

// ── Async Job Queue ──────────────────────────────────────────────────────────

export type AsyncJobType = "reason" | "chart";
export type AsyncJobStatus = "pending" | "running" | "complete" | "error";

export interface AsyncJob {
  jobId: string;
  type: AsyncJobType;
  status: AsyncJobStatus;
  result?: unknown;
  error?: string;
  startedAt: string;
  completedAt?: string;
  input: unknown;
}

const asyncJobs = new Map<string, AsyncJob>();
const MAX_ASYNC_JOBS = 200;

export function createAsyncJob(type: AsyncJobType, input: unknown): AsyncJob {
  const job: AsyncJob = {
    jobId: `job_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    status: "pending",
    startedAt: new Date().toISOString(),
    input,
  };
  asyncJobs.set(job.jobId, job);
  // evict oldest if over cap
  if (asyncJobs.size > MAX_ASYNC_JOBS) {
    const oldest = asyncJobs.keys().next().value;
    if (oldest) asyncJobs.delete(oldest);
  }
  return job;
}

export function updateAsyncJob(jobId: string, update: Partial<Pick<AsyncJob, "status" | "result" | "error" | "completedAt">>): void {
  const job = asyncJobs.get(jobId);
  if (job) Object.assign(job, update);
}

export function getAsyncJob(jobId: string): AsyncJob | undefined { return asyncJobs.get(jobId); }
export function listAsyncJobs(): AsyncJob[] { return Array.from(asyncJobs.values()).reverse(); }
