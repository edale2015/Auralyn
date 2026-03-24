import { auditLog } from "../security/auditLogger";

export type FunnelStep = "landing" | "intake" | "completed" | "abandoned" | "referred";
export type FunnelSource = "nyc_campaign" | "organic" | "referral" | "whatsapp" | "phone" | "direct" | string;

export interface FunnelEvent {
  eventId: string;
  source: FunnelSource;
  step: FunnelStep;
  zip?: string;
  caseId?: string;
  patientId?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface ConversionStats {
  landing: number;
  intake: number;
  completed: number;
  abandoned: number;
  referred: number;
  conversionRate: number;
  abandonmentRate: number;
  bySource: Record<string, { landing: number; intake: number; completed: number }>;
  byZip: Record<string, number>;
}

const funnel: FunnelEvent[] = [];

export const NYC_TARGET_ZIPS = ["10033", "10032", "10031", "10027", "10040", "10034", "10039", "10037", "10035", "10029", "10025", "10024", "10023", "10019", "10036", "10001", "10002", "10003"];

export const CAMPAIGN_COMPLAINTS = ["sore_throat", "ear_pain", "flu_like", "sinus", "rash", "fever", "cough"];

export function trackEvent(data: Omit<FunnelEvent, "eventId" | "timestamp">): FunnelEvent {
  const event: FunnelEvent = {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...data,
    timestamp: Date.now(),
  };

  funnel.push(event);

  auditLog({
    actor: "funnel_engine",
    action: `funnel_${data.step}`,
    patientId: data.patientId,
    details: { source: data.source, zip: data.zip, step: data.step },
  });

  return event;
}

export function generatePatientLink(zip: string, source: FunnelSource = "nyc_campaign", complaint?: string): string {
  const base = process.env.APP_BASE_URL ?? "https://auralyn.com";
  const params = new URLSearchParams({ zip, ref: source });
  if (complaint) params.set("complaint", complaint);
  return `${base}/intake?${params.toString()}`;
}

export function getNYCLinks(): Array<{ zip: string; link: string; neighborhood: string }> {
  const neighborhoods: Record<string, string> = {
    "10033": "Washington Heights", "10032": "Washington Heights", "10031": "Harlem",
    "10027": "Harlem", "10040": "Inwood", "10034": "Inwood", "10039": "Harlem",
    "10037": "Harlem", "10035": "East Harlem", "10029": "East Harlem",
    "10025": "Upper West Side", "10024": "Upper West Side", "10023": "Upper West Side",
    "10019": "Midtown West", "10036": "Midtown", "10001": "Chelsea", "10002": "Lower East Side", "10003": "East Village",
  };
  return NYC_TARGET_ZIPS.map((zip) => ({
    zip,
    neighborhood: neighborhoods[zip] ?? "NYC",
    link: generatePatientLink(zip),
  }));
}

export function getConversionStats(source?: FunnelSource): ConversionStats {
  const events = source ? funnel.filter((e) => e.source === source) : funnel;

  const landing = events.filter((e) => e.step === "landing").length;
  const intake = events.filter((e) => e.step === "intake").length;
  const completed = events.filter((e) => e.step === "completed").length;
  const abandoned = events.filter((e) => e.step === "abandoned").length;
  const referred = events.filter((e) => e.step === "referred").length;

  const bySource: Record<string, { landing: number; intake: number; completed: number }> = {};
  for (const e of funnel) {
    if (!bySource[e.source]) bySource[e.source] = { landing: 0, intake: 0, completed: 0 };
    if (e.step === "landing") bySource[e.source].landing++;
    if (e.step === "intake") bySource[e.source].intake++;
    if (e.step === "completed") bySource[e.source].completed++;
  }

  const byZip: Record<string, number> = {};
  for (const e of funnel) {
    if (e.zip) byZip[e.zip] = (byZip[e.zip] ?? 0) + 1;
  }

  return {
    landing, intake, completed, abandoned, referred,
    conversionRate: landing > 0 ? completed / landing : 0,
    abandonmentRate: intake > 0 ? abandoned / intake : 0,
    bySource,
    byZip,
  };
}

export function getRecentEvents(limit = 50): FunnelEvent[] {
  return funnel.slice(-limit);
}

function seedDemoEvents(): void {
  const sources: FunnelSource[] = ["nyc_campaign", "organic", "whatsapp", "referral"];
  const steps: FunnelStep[] = ["landing", "intake", "completed"];
  const zips = NYC_TARGET_ZIPS.slice(0, 6);

  for (let i = 0; i < 30; i++) {
    trackEvent({
      source: sources[i % sources.length],
      step: steps[Math.min(i % 3, 2)],
      zip: zips[i % zips.length],
    });
  }
}

seedDemoEvents();
