export interface QueueCase {
  id: string;
  clinicId: string;
  patientName: string;
  complaint: string;
  assignedPhysicianId: string | null;
  assignedPhysicianName: string | null;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  createdAt: number;
  status: "pending" | "reviewed" | "escalated";
  confidence: number;
  priority: number;
  slaMinutes: number;
  escalatedAt?: number;
}

export function calculateCasePriority(qc: QueueCase): number {
  let score = 0;
  if (qc.riskLevel === "HIGH") score += 100;
  else if (qc.riskLevel === "MEDIUM") score += 40;
  if (qc.confidence < 0.7) score += 30;
  if (qc.confidence < 0.5) score += 20;
  const ageMinutes = Math.floor((Date.now() - qc.createdAt) / 60000);
  score += Math.min(ageMinutes, 60);
  return score;
}

export function sortQueue(cases: QueueCase[]): QueueCase[] {
  return [...cases].map((c) => ({ ...c, priority: calculateCasePriority(c) })).sort((a, b) => b.priority - a.priority);
}

export function shouldEscalateCase(qc: QueueCase): { escalate: boolean; reason: string } {
  const ageMinutes = Math.floor((Date.now() - qc.createdAt) / 60000);
  if (qc.riskLevel === "HIGH" && ageMinutes >= 5) return { escalate: true, reason: `HIGH risk case pending ${ageMinutes} min (SLA: 5 min)` };
  if (qc.riskLevel === "MEDIUM" && ageMinutes >= 20) return { escalate: true, reason: `MEDIUM risk case pending ${ageMinutes} min (SLA: 20 min)` };
  if (qc.confidence < 0.5 && ageMinutes >= 10) return { escalate: true, reason: `Low confidence (${(qc.confidence * 100).toFixed(0)}%) pending ${ageMinutes} min` };
  return { escalate: false, reason: "Within SLA" };
}

const SLA_MAP: Record<string, number> = { HIGH: 5, MEDIUM: 20, LOW: 60 };

const queue: QueueCase[] = [];

export function seedQueue() {
  if (queue.length > 0) return;
  const cases = [
    { name: "John Peters", complaint: "Severe ear pain with discharge", risk: "HIGH" as const, conf: 0.45, age: 8 },
    { name: "Lisa Wang", complaint: "Chronic sinusitis, 3 weeks", risk: "MEDIUM" as const, conf: 0.72, age: 25 },
    { name: "Carlos Rivera", complaint: "Sore throat and fever", risk: "LOW" as const, conf: 0.85, age: 12 },
    { name: "Amy Foster", complaint: "Sudden hearing loss left ear", risk: "HIGH" as const, conf: 0.38, age: 3 },
    { name: "Tom Bradley", complaint: "Nosebleed recurring daily", risk: "MEDIUM" as const, conf: 0.65, age: 35 },
    { name: "Nina Patel", complaint: "Difficulty swallowing, weight loss", risk: "HIGH" as const, conf: 0.42, age: 6 },
    { name: "Marcus Lee", complaint: "Nasal congestion, post-nasal drip", risk: "LOW" as const, conf: 0.91, age: 5 },
    { name: "Rachel Green", complaint: "Dizziness and vertigo episodes", risk: "MEDIUM" as const, conf: 0.58, age: 18 },
    { name: "James Cooper", complaint: "Hoarseness for 6 weeks", risk: "MEDIUM" as const, conf: 0.62, age: 40 },
    { name: "Diana Kim", complaint: "Facial swelling and pain", risk: "HIGH" as const, conf: 0.51, age: 2 },
  ];
  cases.forEach((c, i) => {
    queue.push({
      id: `q_${i + 1}`,
      clinicId: i < 6 ? "clinic_a" : "clinic_b",
      patientName: c.name,
      complaint: c.complaint,
      assignedPhysicianId: null,
      assignedPhysicianName: null,
      riskLevel: c.risk,
      createdAt: Date.now() - c.age * 60000,
      status: "pending",
      confidence: c.conf,
      priority: 0,
      slaMinutes: SLA_MAP[c.risk],
    });
  });
}

seedQueue();

export function getQueue(): QueueCase[] { return sortQueue(queue.filter((c) => c.status === "pending")); }
export function getAllCases(): QueueCase[] { return queue; }
export function getCase(id: string): QueueCase | undefined { return queue.find((c) => c.id === id); }

export function escalateCases(): { scanned: number; escalated: QueueCase[] } {
  const pending = queue.filter((c) => c.status === "pending");
  const escalated: QueueCase[] = [];
  pending.forEach((c) => {
    const result = shouldEscalateCase(c);
    if (result.escalate) { c.status = "escalated"; c.escalatedAt = Date.now(); escalated.push(c); }
  });
  return { scanned: pending.length, escalated };
}
