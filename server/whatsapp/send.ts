import twilio from "twilio";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalizeWhatsAppTo(to: string): string {
  let t = String(to || "").trim();
  if (!t) throw new Error("Missing 'to' phone number");
  
  if (t.startsWith("whatsapp:")) {
    t = t.replace("whatsapp:", "").trim();
  }
  
  if (!t.startsWith("+")) {
    t = "+" + t;
  }
  
  return "whatsapp:" + t;
}

const accountSid = envOrThrow("TWILIO_ACCOUNT_SID");
const authToken = envOrThrow("TWILIO_AUTH_TOKEN");
const fromWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886";

const client = twilio(accountSid, authToken);

export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  const formattedTo = normalizeWhatsAppTo(to);
  const text = String(body ?? "").trim();
  if (!text) throw new Error("Missing message body");

  console.log(`Sending WhatsApp message to: ${formattedTo}`);

  await client.messages.create({
    from: fromWhatsApp,
    to: formattedTo,
    body: text,
  });
}
