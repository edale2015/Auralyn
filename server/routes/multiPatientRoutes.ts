import express, { Request, Response } from "express";
import { db } from "../db";
import { sql as drizzleSql } from "drizzle-orm";
import { computeAdmissionRisk, seedAdmissionRules } from "../engine/admissionRisk";
import { sendSMS, sendWhatsApp } from "../services/smsService";
import {
  selectHospital,
  seedHospitals,
  seedEmsUnits,
  sendPhysicianAlert,
} from "../engine/hospitalRouting";
import { requirePhysician } from "../auth/requirePhysician";
import { auditLog }          from "../security/auditLogger";

// ── On-call physician lookup (server-side, not user-supplied) ──────────────────
// Phase 6 Fix: physician phone must come from a server-controlled source, never
// from the request body. An attacker with a valid physician JWT could otherwise
// trigger Twilio SMS to any phone number (SMS toll fraud / abuse).
//
// Resolution order:
//   1. Env var ON_CALL_PHONE_<CLINIC_ID_UPPERCASE_UNDERSCORE> e.g. ON_CALL_PHONE_CLINIC_NYC_01
//   2. Global fallback ON_CALL_PHYSICIAN_PHONE
//   3. null → caller returns 500 "No on-call physician configured"
async function getOnCallPhysician(clinicId: string): Promise<{ id: string; phone: string } | null> {
  const safeKey = clinicId.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const phone =
    process.env[`ON_CALL_PHONE_${safeKey}`] ??
    process.env.ON_CALL_PHYSICIAN_PHONE ??
    null;
  if (!phone) return null;
  return { id: `on-call-${clinicId}`, phone };
}

const router = express.Router();

// ── GET /api/command/grid ──────────────────────────────────────────────────────
// All patients sorted by risk_score DESC + demo seed if empty
router.get("/grid", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(drizzleSql`
      SELECT patient_id, name, age, phone, chief_complaint,
             top_dx, disposition, risk_score, admission_risk,
             vitals, flags, last_update
      FROM patient_dashboard_state
      ORDER BY risk_score DESC, last_update DESC
    `);
    let rows = (result.rows ?? result) as any[];

    // Auto-seed demo patients if grid is empty
    if (!rows.length) {
      await seedDemoPatients();
      const r2 = await db.execute(drizzleSql`
        SELECT * FROM patient_dashboard_state ORDER BY risk_score DESC
      `);
      rows = (r2.rows ?? r2) as any[];
    }

    res.json({ ok: true, patients: rows, count: rows.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/command/grid/upsert ─────────────────────────────────────────────
router.post("/grid/upsert", async (req: Request, res: Response) => {
  try {
    const p = req.body;
    const flags: string[] = p.flags ?? [];
    const flagsLit = flags.length > 0 ? `'{${flags.join(",")}}'` : "'{}'";
    await db.execute(drizzleSql`
      INSERT INTO patient_dashboard_state
        (patient_id, name, age, phone, chief_complaint, top_dx, disposition,
         risk_score, admission_risk, vitals, flags, last_update)
      VALUES
        (${p.patientId ?? p.patient_id}, ${p.name ?? null}, ${p.age ?? null},
         ${p.phone ?? null}, ${p.chiefComplaint ?? p.chief_complaint ?? null},
         ${p.topDx ?? p.top_dx ?? null}, ${p.disposition ?? "pending"},
         ${p.riskScore ?? p.risk_score ?? 0}, ${p.admissionRisk ?? p.admission_risk ?? 0},
         ${JSON.stringify(p.vitals ?? {})}::jsonb,
         ${drizzleSql.raw(flagsLit)}::text[], NOW())
      ON CONFLICT (patient_id) DO UPDATE SET
        name            = EXCLUDED.name,
        top_dx          = EXCLUDED.top_dx,
        disposition     = EXCLUDED.disposition,
        risk_score      = EXCLUDED.risk_score,
        admission_risk  = EXCLUDED.admission_risk,
        vitals          = EXCLUDED.vitals,
        flags           = EXCLUDED.flags,
        last_update     = NOW()
    `);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ── GET /api/command/admission-risk ───────────────────────────────────────────
router.get("/admission-risk", async (_req: Request, res: Response) => {
  try {
    const rulesResult = await db.execute(drizzleSql`
      SELECT feature_key, label, weight, category FROM kb_admission_rules WHERE is_active = TRUE ORDER BY weight DESC
    `);
    const rules = (rulesResult.rows ?? rulesResult) as any[];
    res.json({ ok: true, rules, count: rules.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/command/admission-risk/compute ──────────────────────────────────
router.post("/admission-risk/compute", async (req: Request, res: Response) => {
  try {
    const result = await computeAdmissionRisk(req.body.features ?? req.body);
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/command/admission-risk/seed ─────────────────────────────────────
router.post("/admission-risk/seed", async (_req: Request, res: Response) => {
  try {
    const count = await seedAdmissionRules();
    res.json({ ok: true, seeded: count });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/agents/outreach ─────────────────────────────────────────────────
router.post("/outreach", async (req: Request, res: Response) => {
  try {
    const { patientId, channel, to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({ error: "to and message are required" });
    }

    let result: any;
    if (channel === "sms") {
      result = await sendSMS(to, message);
    } else if (channel === "whatsapp") {
      result = await sendWhatsApp(to, message);
    } else {
      return res.status(400).json({ error: "channel must be sms or whatsapp" });
    }

    // Log to outreach table
    await db.execute(drizzleSql`
      INSERT INTO patient_outreach (patient_id, channel, message, status)
      VALUES (${patientId ?? "unknown"}, ${channel}, ${message}, ${result.success ? "sent" : "failed"})
    `);

    return res.json({ ok: result.success, sid: result.sid, channel });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── POST /api/agents/voice ────────────────────────────────────────────────────
router.post("/voice-call", async (req: Request, res: Response) => {
  try {
    const { to, patientId, message } = req.body;

    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const auth  = process.env.TWILIO_AUTH_TOKEN;
    const from  = process.env.TWILIO_FROM_NUMBER;

    if (!sid || !auth || !from) {
      return res.status(503).json({ error: "Twilio not fully configured (need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)" });
    }
    if (!to) {
      return res.status(400).json({ error: "to is required" });
    }

    const safeMsg = message ?? "This is an automated call from Auralyn Medical. Please seek urgent evaluation immediately. Thank you.";
    const twiml = `<Response><Say voice="alice">${safeMsg}</Say><Pause length="1"/><Say voice="alice">To confirm you received this message, press 1. Goodbye.</Say><Gather numDigits="1"/></Response>`;

    const body = new URLSearchParams({
      To: to,
      From: from,
      Twiml: twiml,
    });

    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${sid}:${auth}`).toString("base64"),
      },
      body: body.toString(),
    });

    const data = await r.json() as any;

    // Log it
    await db.execute(drizzleSql`
      INSERT INTO patient_outreach (patient_id, channel, message, status)
      VALUES (${patientId ?? "unknown"}, 'voice', ${safeMsg}, ${data.sid ? "initiated" : "failed"})
    `);

    if (!r.ok) return res.status(502).json({ error: data.message ?? "Twilio error", data });
    return res.json({ ok: true, callSid: data.sid, status: data.status });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── GET /api/command/outreach-log ─────────────────────────────────────────────
router.get("/outreach-log", async (req: Request, res: Response) => {
  try {
    const patientId = req.query.patientId as string | undefined;
    const result = patientId
      ? await db.execute(drizzleSql`SELECT * FROM patient_outreach WHERE patient_id = ${patientId} ORDER BY created_at DESC LIMIT 50`)
      : await db.execute(drizzleSql`SELECT * FROM patient_outreach ORDER BY created_at DESC LIMIT 100`);
    res.json({ ok: true, log: (result.rows ?? result) as any[] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/command/hospitals ────────────────────────────────────────────────
router.get("/hospitals", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(drizzleSql`
      SELECT id, name, lat, lon, services, is_active FROM kb_hospitals WHERE is_active = TRUE ORDER BY name
    `);
    res.json({ ok: true, hospitals: (result.rows ?? result) as any[] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/command/hospitals/seed ─────────────────────────────────────────
router.post("/hospitals/seed", async (_req: Request, res: Response) => {
  try {
    const hospitals = await seedHospitals();
    const emsUnits  = await seedEmsUnits();
    res.json({ ok: true, hospitals, emsUnits });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/command/hospital-route ─────────────────────────────────────────
router.post("/hospital-route", async (req: Request, res: Response) => {
  try {
    const { lat, lon, service = "emergency" } = req.body;
    if (lat === undefined || lon === undefined) {
      return res.status(400).json({ error: "lat and lon are required" });
    }
    const hospital = await selectHospital({ lat: Number(lat), lon: Number(lon) }, service);
    if (!hospital) {
      return res.json({ ok: true, hospital: null, message: "No matching hospitals found" });
    }
    return res.json({ ok: true, hospital, neededService: service });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ── GET /api/command/ems-units ────────────────────────────────────────────────
router.get("/ems-units", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(drizzleSql`
      SELECT id, unit_name, lat, lon, status FROM ems_units ORDER BY unit_name
    `);
    res.json({ ok: true, units: (result.rows ?? result) as any[] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/command/physician-alert ─────────────────────────────────────────
// Phase 6 Fix: physician phone is now resolved server-side via getOnCallPhysician().
// Previously accepted physicianPhone from req.body — any authenticated physician
// could supply an arbitrary phone number and trigger Twilio SMS (toll fraud vector).
// Now: phone comes only from env-var config scoped to the authenticated clinic.
router.post("/physician-alert", requirePhysician, async (req: Request, res: Response) => {
  try {
    const physician = (req as any).physician;
    const { patientId, message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const onCall = await getOnCallPhysician(physician.clinicId);
    if (!onCall) {
      return res.status(500).json({
        error: "No on-call physician configured for this clinic",
        hint: "Set ON_CALL_PHYSICIAN_PHONE or ON_CALL_PHONE_<CLINIC_ID> environment variable",
      });
    }

    const result = await sendPhysicianAlert(
      patientId ?? "unknown",
      `On-Call [${physician.clinicId}]`,
      onCall.phone,
      message.trim()
    );

    // Audit every physician-alert — immutable record for HIPAA compliance
    auditLog({
      actor:   physician.id ?? "unknown",
      action:  "PHYSICIAN_ALERT",
      details: { onCallId: onCall.id, patientId: patientId ?? "unknown", clinicId: physician.clinicId },
    });

    return res.json(result);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ── GET /api/command/physician-alerts ─────────────────────────────────────────
// FIX: requirePhysician — alert history is PHI-adjacent and must be auth-gated.
router.get("/physician-alerts", requirePhysician, async (req: Request, res: Response) => {
  try {
    const patientId = req.query.patientId as string | undefined;
    const result = patientId
      ? await db.execute(drizzleSql`
          SELECT * FROM physician_alerts WHERE patient_id = ${patientId} ORDER BY created_at DESC LIMIT 50
        `)
      : await db.execute(drizzleSql`
          SELECT * FROM physician_alerts ORDER BY created_at DESC LIMIT 100
        `);
    res.json({ ok: true, alerts: (result.rows ?? result) as any[] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/command/system-health ────────────────────────────────────────────
router.get("/system-health", async (_req: Request, res: Response) => {
  const results: Array<{ name: string; pass: boolean; detail?: string; durationMs?: number }> = [];

  async function probe(name: string, fn: () => Promise<string>) {
    const t0 = Date.now();
    try {
      const detail = await fn();
      results.push({ name, pass: true, detail, durationMs: Date.now() - t0 });
    } catch (e: any) {
      results.push({ name, pass: false, detail: e.message?.slice(0, 80), durationMs: Date.now() - t0 });
    }
  }

  await probe("Patient Grid",   async () => {
    const r = await db.execute(drizzleSql`SELECT COUNT(*)::int cnt FROM patient_dashboard_state`);
    const cnt = ((r.rows ?? r) as any[])[0]?.cnt ?? 0;
    return `${cnt} patients`;
  });

  await probe("KB Admission Rules", async () => {
    const r = await db.execute(drizzleSql`SELECT COUNT(*)::int cnt FROM kb_admission_rules WHERE is_active = TRUE`);
    const cnt = ((r.rows ?? r) as any[])[0]?.cnt ?? 0;
    if (cnt === 0) throw new Error("No rules seeded");
    return `${cnt} active rules`;
  });

  await probe("Hospital Network", async () => {
    const r = await db.execute(drizzleSql`SELECT COUNT(*)::int cnt FROM kb_hospitals WHERE is_active = TRUE`);
    const cnt = ((r.rows ?? r) as any[])[0]?.cnt ?? 0;
    return `${cnt} hospitals`;
  });

  await probe("EMS Units", async () => {
    const r = await db.execute(drizzleSql`SELECT COUNT(*)::int cnt FROM ems_units`);
    const cnt = ((r.rows ?? r) as any[])[0]?.cnt ?? 0;
    return `${cnt} units`;
  });

  await probe("Outreach Log", async () => {
    const r = await db.execute(drizzleSql`SELECT COUNT(*)::int cnt FROM patient_outreach`);
    const cnt = ((r.rows ?? r) as any[])[0]?.cnt ?? 0;
    return `${cnt} events`;
  });

  await probe("Physician Alerts", async () => {
    const r = await db.execute(drizzleSql`SELECT COUNT(*)::int cnt FROM physician_alerts`);
    const cnt = ((r.rows ?? r) as any[])[0]?.cnt ?? 0;
    return `${cnt} logged`;
  });

  await probe("Admission Risk Engine", async () => {
    const result = await computeAdmissionRisk({ age_over_65: true, chest_pain: true });
    if (result.score === 0 && result.totalRules === 0) throw new Error("Engine returned 0 rules");
    return `score=${result.score.toFixed(2)} level=${result.level}`;
  });

  await probe("Hospital Routing", async () => {
    const h = await selectHospital({ lat: 37.774, lon: -122.419 }, "emergency");
    return h ? `→ ${h.name} (${h.dist?.toFixed(1)}km)` : "No hospitals found";
  });

  const passed = results.filter(r => r.pass).length;
  res.json({ ok: true, results, passed, failed: results.length - passed, total: results.length });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedDemoPatients() {
  const demos = [
    {
      id: "pt-001", name: "Margaret Chen", age: 72, phone: "+15551001001",
      complaint: "Chest pain and shortness of breath", dx: "DX_BAY_CARDIAC_ACS",
      disposition: "ER_NOW", risk: 0.92, admRisk: 0.88,
      vitals: { hr: 118, spo2: 91, sbp: 88 },
      flags: ["high_risk", "dyspnea", "chest_pain", "age_over_65"],
    },
    {
      id: "pt-002", name: "James Rivera", age: 45, phone: "+15551001002",
      complaint: "High fever and severe sore throat", dx: "DX_BAY_STREP_THROAT",
      disposition: "urgent_care", risk: 0.61, admRisk: 0.35,
      vitals: { hr: 98, spo2: 97, temp: 39.2 },
      flags: ["fever_high"],
    },
    {
      id: "pt-003", name: "Aisha Okonkwo", age: 28, phone: "+15551001003",
      complaint: "Runny nose, mild sore throat", dx: "DX_BAY_VIRAL_URI",
      disposition: "self_care", risk: 0.12, admRisk: 0.05,
      vitals: { hr: 72, spo2: 99 },
      flags: [],
    },
    {
      id: "pt-004", name: "Robert Kim", age: 81, phone: "+15551001004",
      complaint: "Confusion and fever", dx: "DX_BAY_SEPSIS",
      disposition: "ER_NOW", risk: 0.89, admRisk: 0.92,
      vitals: { hr: 124, spo2: 93, sbp: 92 },
      flags: ["sepsis_criteria", "altered_mentation", "age_over_80", "hr_over_120"],
    },
    {
      id: "pt-005", name: "Diana Torres", age: 55, phone: "+15551001005",
      complaint: "Ear pain, dizziness", dx: "DX_BAY_OTITIS_MEDIA",
      disposition: "office_followup", risk: 0.28, admRisk: 0.12,
      vitals: { hr: 80, spo2: 98 },
      flags: [],
    },
    {
      id: "pt-006", name: "Thomas Walsh", age: 68, phone: "+15551001006",
      complaint: "Sudden severe headache, stiff neck", dx: "DX_BAY_MENINGITIS",
      disposition: "ER_NOW", risk: 0.95, admRisk: 0.95,
      vitals: { hr: 102, spo2: 96, temp: 38.8 },
      flags: ["high_risk", "severe_pain", "prior_admission", "age_over_65"],
    },
    {
      id: "pt-007", name: "Sarah Nguyen", age: 33, phone: "+15551001007",
      complaint: "Cough, fever for 3 days", dx: "DX_BAY_INFLUENZA_A",
      disposition: "self_care", risk: 0.34, admRisk: 0.18,
      vitals: { hr: 86, spo2: 97, temp: 38.1 },
      flags: ["fever_high"],
    },
    {
      id: "pt-008", name: "Charles Brown", age: 76, phone: "+15551001008",
      complaint: "Worsening COPD, wheezing", dx: "DX_BAY_PNEUMONIA",
      disposition: "urgent_care", risk: 0.74, admRisk: 0.72,
      vitals: { hr: 108, spo2: 90 },
      flags: ["spo2_low", "copd", "age_over_65", "dyspnea"],
    },
  ];

  for (const p of demos) {
    const flagsLiteral = p.flags.length > 0
      ? `'{${p.flags.join(",")}}'`
      : "'{}'";
    await db.execute(drizzleSql`
      INSERT INTO patient_dashboard_state
        (patient_id, name, age, phone, chief_complaint, top_dx, disposition,
         risk_score, admission_risk, vitals, flags, last_update)
      VALUES
        (${p.id}, ${p.name}, ${p.age}, ${p.phone}, ${p.complaint},
         ${p.dx}, ${p.disposition}, ${p.risk}, ${p.admRisk},
         ${JSON.stringify(p.vitals)}::jsonb, ${drizzleSql.raw(flagsLiteral)}::text[], NOW())
      ON CONFLICT (patient_id) DO NOTHING
    `);
  }
}

export default router;
