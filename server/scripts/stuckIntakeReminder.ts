import { db } from "../firebase";
import { BASE_URL } from "../intake/intakeAuth";
import { sendWhatsAppMessage } from "../whatsapp/send";

const ED_WARNING_FLOWS = new Set([
  "EMERG_CRITICAL_V1",
  "TRAUMA_MAJOR_V1",
  "UROGYN_TESTICULAR_PAIN_V1",
  "UROGYN_VAGINAL_BLEEDING_V1",
  "OPHTH_VISION_LOSS_V1",
  "NEURO_WEAKNESS_V1",
]);

function norm(x: any) {
  return String(x ?? "").trim();
}

async function main() {
  const MINUTES = Number(process.env.REMINDER_MINUTES || 12);
  const sinceMs = Date.now() - MINUTES * 60 * 1000;

  const snap = await db.collection("encounters")
    .where("status", "==", "in_progress")
    .limit(500)
    .get();

  let sent = 0;
  let skippedEdWarning = 0;

  for (const doc of snap.docs) {
    const e = doc.data() as any;

    const flowId = norm(e.flowId);
    if (ED_WARNING_FLOWS.has(flowId)) {
      skippedEdWarning++;
      continue;
    }

    const intakeToken = norm(e.intakeToken);
    const intakeCode = norm(e.intakeCode);
    const exp = Number(e.intakeExpiresAt || 0);
    if (!intakeToken || !intakeCode || !exp) continue;
    if (Date.now() > exp) continue;

    const updatedAtMs = e.updatedAt?.toMillis?.() ?? (e.updatedAt ? new Date(e.updatedAt).getTime() : 0);
    const createdAtMs = e.createdAt?.toMillis?.() ?? (e.createdAt ? new Date(e.createdAt).getTime() : 0);
    const ts = Math.max(updatedAtMs, createdAtMs);

    if (!ts || ts > sinceMs) continue;

    let answersObj: any = {};
    try { answersObj = e.answers ? JSON.parse(e.answers) : {}; } catch { answersObj = {}; }
    if (answersObj.__remindedAt && Number(answersObj.__remindedAt) > sinceMs) continue;

    const patientId = norm(e.patientId);
    if (!patientId) continue;

    const pdoc = await db.collection("patients").doc(patientId).get();
    const phoneNumber = norm(pdoc.data()?.phoneNumber);
    if (!phoneNumber.startsWith("whatsapp:")) continue;

    const link = `${BASE_URL}/intake/${intakeToken}`;
    await sendWhatsAppMessage(
      phoneNumber,
      `Quick check-in: if you still want to complete the form, here's your secure link:\n${link}\nCode: ${intakeCode}\nReply LINK anytime to resend.`
    );

    answersObj.__remindedAt = Date.now();
    await doc.ref.update({ answers: JSON.stringify(answersObj), updatedAt: new Date() });

    sent++;
  }

  console.log(`Stuck intake reminders sent: ${sent}`);
  if (skippedEdWarning > 0) {
    console.log(`Skipped ED-warning flows: ${skippedEdWarning}`);
  }
}

main().catch((e) => {
  console.error("stuckIntakeReminder failed:", e);
  process.exit(1);
});
