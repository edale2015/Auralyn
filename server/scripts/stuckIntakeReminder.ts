import { db } from "../firebase";
import { BASE_URL } from "../intake/intakeAuth";
import twilio from "twilio";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || "";

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

function norm(x: any) {
  return String(x ?? "").trim();
}

async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  let formattedTo = to;
  if (formattedTo.startsWith("whatsapp:")) {
    formattedTo = formattedTo.replace("whatsapp:", "").trim();
  }
  if (!formattedTo.startsWith("+")) {
    formattedTo = "+" + formattedTo;
  }
  formattedTo = "whatsapp:" + formattedTo;

  console.log(`Sending reminder to: ${formattedTo}`);
  await twilioClient.messages.create({
    from: TWILIO_WHATSAPP_NUMBER,
    to: formattedTo,
    body: body,
  });
}

async function main() {
  const MINUTES = Number(process.env.REMINDER_MINUTES || 12);
  const sinceMs = Date.now() - MINUTES * 60 * 1000;

  const snap = await db.collection("encounters")
    .where("status", "==", "in_progress")
    .limit(500)
    .get();

  let sent = 0;
  for (const doc of snap.docs) {
    const e = doc.data() as any;

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
}

main().catch((e) => {
  console.error("stuckIntakeReminder failed:", e);
  process.exit(1);
});
