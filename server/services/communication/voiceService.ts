let _client: any = null;

function getTwilioClient() {
  if (_client) return _client;

  const sid  = process.env.TWILIO_SID || process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH || process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !auth) {
    throw new Error("Twilio not configured: TWILIO_SID and TWILIO_AUTH required");
  }

  const twilio = require("twilio");
  _client = twilio(sid, auth);
  return _client;
}

export interface VoiceCallResult {
  sid: string;
  status: string;
  to: string;
}

export async function speakToPatient(phone: string, message: string): Promise<VoiceCallResult> {
  const client = getTwilioClient();
  const from = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_NUMBER;

  if (!from) throw new Error("TWILIO_FROM_NUMBER not configured");

  const safeMessage = message.replace(/[<>&"]/g, (c) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;",
  }[c] || c));

  const call = await client.calls.create({
    to: phone,
    from,
    twiml: `<Response><Say voice="alice">${safeMessage}</Say></Response>`,
  });

  return { sid: call.sid, status: call.status, to: call.to };
}

export function buildPatientVoiceMessage(disposition: string, decision: string): string {
  if (decision === "ANTIBIOTIC_GIVEN") {
    return `Based on your symptoms and examination today, this looks like a bacterial infection. We are prescribing an antibiotic that should help you recover quickly. Please take the full course as directed.`;
  }

  if (decision === "NO_ANTIBIOTIC_OR_DELAYED" || decision === "TEST_OR_DELAYED_RX") {
    return `Based on your symptoms, your risk of a bacterial infection is low. Antibiotics are not likely to help at this stage. We will treat your symptoms and monitor for changes. If you are not improving in 48 to 72 hours, please come back or call us.`;
  }

  return `Your visit today is complete. Disposition: ${disposition}. Please follow up as instructed by your care team.`;
}

export function isTwilioConfigured(): boolean {
  const sid  = process.env.TWILIO_SID || process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH || process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_NUMBER;
  return !!(sid && auth && from);
}
