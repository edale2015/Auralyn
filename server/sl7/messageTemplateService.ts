import * as fs from "fs/promises";
import * as path from "path";

export type Channel = "whatsapp" | "sms" | "telegram";
export type TemplateStatus = "active" | "draft" | "archived";

export interface MessageTemplate {
  id: string;
  name: string;
  complaint: string;
  disposition: string;
  channel: Channel;
  status: TemplateStatus;
  subject: string;
  body: string;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryLogEntry {
  id: string;
  templateId: string;
  caseId: string;
  channel: Channel;
  recipient: string;
  status: "sent" | "delivered" | "failed" | "pending";
  sentAt: string;
  deliveredAt?: string;
  errorMessage?: string;
}

const TEMPLATES_FILE = path.join(process.cwd(), "message_templates.ndjson");
const DELIVERY_LOG_FILE = path.join(process.cwd(), "delivery_log.ndjson");

const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: "tpl_001",
    name: "UTI Home Care Instructions",
    complaint: "uti",
    disposition: "Home Care",
    channel: "whatsapp",
    status: "active",
    subject: "Your Care Instructions",
    body: "Hi {{patientName}}, your triage is complete. Based on your symptoms, we recommend home care. Drink plenty of fluids, take OTC pain relief, and monitor symptoms. If fever develops or symptoms worsen in 48h, contact us. — {{clinicName}}",
    variables: ["patientName", "clinicName"],
    createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "tpl_002",
    name: "Antibiotic Prescription Sent",
    complaint: "sore_throat",
    disposition: "Prescription",
    channel: "sms",
    status: "active",
    subject: "Prescription Ready",
    body: "Hi {{patientName}}, your prescription for {{medication}} has been sent to {{pharmacy}}. Take as directed. Complete the full course. Refills: {{refills}}. Questions? Call {{clinicPhone}}.",
    variables: ["patientName", "medication", "pharmacy", "refills", "clinicPhone"],
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
  {
    id: "tpl_003",
    name: "ED Referral Notification",
    complaint: "chest_pain",
    disposition: "ED",
    channel: "whatsapp",
    status: "active",
    subject: "Urgent: Please go to the Emergency Department",
    body: "⚠️ {{patientName}}, based on your symptoms our physician recommends you go to the nearest Emergency Department immediately. Do not drive yourself. Call 911 if symptoms worsen. Your case ID is {{caseId}}.",
    variables: ["patientName", "caseId"],
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: "tpl_004",
    name: "Follow-up Reminder",
    complaint: "fever",
    disposition: "Telehealth Follow-up",
    channel: "telegram",
    status: "active",
    subject: "Follow-up Appointment Reminder",
    body: "Hi {{patientName}}, this is a reminder for your telehealth follow-up on {{appointmentDate}} at {{appointmentTime}}. Join via: {{joinLink}}. Your physician will review your progress.",
    variables: ["patientName", "appointmentDate", "appointmentTime", "joinLink"],
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
];

async function readTemplates(): Promise<MessageTemplate[]> {
  try {
    const raw = await fs.readFile(TEMPLATES_FILE, "utf8");
    return raw.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

async function saveTemplates(templates: MessageTemplate[]): Promise<void> {
  await fs.writeFile(TEMPLATES_FILE, templates.map(t => JSON.stringify(t)).join("\n") + "\n");
}

async function readDeliveryLog(): Promise<DeliveryLogEntry[]> {
  try {
    const raw = await fs.readFile(DELIVERY_LOG_FILE, "utf8");
    return raw.trim().split("\n").filter(Boolean).map(l => JSON.parse(l)).reverse().slice(0, 100);
  } catch {
    return generateMockDeliveryLog();
  }
}

function generateMockDeliveryLog(): DeliveryLogEntry[] {
  const statuses: DeliveryLogEntry["status"][] = ["sent", "delivered", "delivered", "delivered", "failed"];
  const channels: Channel[] = ["whatsapp", "sms", "telegram"];
  return Array.from({ length: 20 }, (_, i) => ({
    id: `dlv_${i + 1}`,
    templateId: `tpl_00${(i % 4) + 1}`,
    caseId: `CASE-${1000 + i}`,
    channel: channels[i % 3],
    recipient: `+1555${String(i).padStart(7, "0")}`,
    status: statuses[i % statuses.length],
    sentAt: new Date(Date.now() - i * 3600000).toISOString(),
    deliveredAt: statuses[i % statuses.length] === "delivered" ? new Date(Date.now() - i * 3600000 + 15000).toISOString() : undefined,
    errorMessage: statuses[i % statuses.length] === "failed" ? "Invalid phone number" : undefined,
  }));
}

export async function listTemplates(filters?: { channel?: Channel; complaint?: string; status?: TemplateStatus }): Promise<MessageTemplate[]> {
  let templates = await readTemplates();
  if (filters?.channel) templates = templates.filter(t => t.channel === filters.channel);
  if (filters?.complaint) templates = templates.filter(t => t.complaint === filters.complaint);
  if (filters?.status) templates = templates.filter(t => t.status === filters.status);
  return templates;
}

export async function getTemplate(id: string): Promise<MessageTemplate | null> {
  const all = await readTemplates();
  return all.find(t => t.id === id) ?? null;
}

export async function createTemplate(data: Omit<MessageTemplate, "id" | "createdAt" | "updatedAt">): Promise<MessageTemplate> {
  const templates = await readTemplates();
  const template: MessageTemplate = {
    ...data,
    id: `tpl_${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  templates.push(template);
  await saveTemplates(templates);
  return template;
}

export async function updateTemplate(id: string, patch: Partial<MessageTemplate>): Promise<MessageTemplate | null> {
  const templates = await readTemplates();
  const idx = templates.findIndex(t => t.id === id);
  if (idx === -1) return null;
  templates[idx] = { ...templates[idx], ...patch, updatedAt: new Date().toISOString() };
  await saveTemplates(templates);
  return templates[idx];
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const templates = await readTemplates();
  const filtered = templates.filter(t => t.id !== id);
  if (filtered.length === templates.length) return false;
  await saveTemplates(filtered);
  return true;
}

export async function getDeliveryLog(): Promise<DeliveryLogEntry[]> {
  return readDeliveryLog();
}

export async function getDeliveryStats() {
  const log = await readDeliveryLog();
  const total = log.length;
  const delivered = log.filter(l => l.status === "delivered").length;
  const failed = log.filter(l => l.status === "failed").length;
  const byChannel = { whatsapp: 0, sms: 0, telegram: 0 };
  log.forEach(l => byChannel[l.channel]++);
  return { total, delivered, failed, deliveryRate: total > 0 ? Number(((delivered / total) * 100).toFixed(1)) : 0, byChannel };
}
