export interface VoiceSession {
  callSid:       string;
  from:          string;
  status:        "active" | "completed" | "emergency" | "error" | "no-response";
  startedAt:     string;
  endedAt?:      string;
  durationSecs?: number;
  transcript:    string[];
  clinicalResult?: any;
  complaint?:    string;
  disposition?:  string;
  turnCount:     number;
}

const sessions: Map<string, VoiceSession> = new Map();
const completed: VoiceSession[] = [];

export function startSession(callSid: string, from: string): VoiceSession {
  const session: VoiceSession = {
    callSid,
    from,
    status:    "active",
    startedAt: new Date().toISOString(),
    transcript: [],
    turnCount:  0,
  };
  sessions.set(callSid, session);
  return session;
}

export function appendTranscript(callSid: string, text: string, role: "patient" | "ai" = "patient"): void {
  const s = sessions.get(callSid);
  if (!s) return;
  s.transcript.push(`[${role.toUpperCase()}] ${text}`);
  s.turnCount++;
  if (role === "patient" && !s.complaint) s.complaint = text.slice(0, 120);
}

export function setSessionResult(callSid: string, result: any): void {
  const s = sessions.get(callSid);
  if (!s) return;
  s.clinicalResult = result;
  s.disposition    = result?.disposition ?? result?.recommendation ?? "See provider";
}

export function endSession(callSid: string, status: VoiceSession["status"] = "completed"): void {
  const s = sessions.get(callSid);
  if (!s) return;
  s.status      = status;
  s.endedAt     = new Date().toISOString();
  s.durationSecs = Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000);
  sessions.delete(callSid);
  completed.unshift(s);
  if (completed.length > 100) completed.pop();
}

export function getActiveSession(callSid: string): VoiceSession | undefined {
  return sessions.get(callSid);
}

export function getActiveSessions(): VoiceSession[] {
  return Array.from(sessions.values());
}

export function getCompletedSessions(limit = 20): VoiceSession[] {
  return completed.slice(0, limit);
}

export function getVoiceStats() {
  const all = completed;
  const byStatus  = all.reduce((acc, s) => { acc[s.status] = (acc[s.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const avgDuration = all.length
    ? all.filter(s => s.durationSecs).reduce((sum, s) => sum + (s.durationSecs ?? 0), 0) / all.filter(s => s.durationSecs).length
    : 0;
  return {
    totalSessions:   all.length + sessions.size,
    active:          sessions.size,
    completed:       all.length,
    avgDurationSecs: Math.round(avgDuration),
    byStatus,
  };
}
