import { channelConfig } from "./channelConfig";

export async function sendWhatsAppMetaMessage(to: string, text: string): Promise<any> {
  const { phoneNumberId, accessToken } = channelConfig.whatsapp;

  if (!phoneNumberId || !accessToken) {
    console.warn("[WhatsApp Meta] credentials not configured — message not sent");
    return { ok: false, reason: "not_configured" };
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WhatsApp Meta send failed: ${res.status} ${body}`);
  }

  return res.json();
}

export async function sendWhatsAppTemplateMessage(to: string, templateName: string, languageCode = "en_US"): Promise<any> {
  const { phoneNumberId, accessToken } = channelConfig.whatsapp;
  if (!phoneNumberId || !accessToken) return { ok: false, reason: "not_configured" };

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: { name: templateName, language: { code: languageCode } },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WhatsApp template send failed: ${res.status} ${body}`);
  }

  return res.json();
}
