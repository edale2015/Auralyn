export async function sendSlackAlert(msg: string): Promise<void> {
  const webhook = process.env.SLACK_WEBHOOK;
  if (!webhook) { console.log(`[Slack] ${msg}`); return; }
  await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: msg }),
  });
}

export async function sendWhatsAppAlert(msg: string): Promise<void> {
  const url = process.env.TWILIO_URL;
  if (!url) { console.log(`[WhatsApp] ${msg}`); return; }
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: msg }),
  });
}

export async function evaluateAlerts(metrics: {
  safetyMismatchRate?: number;
  latency?: number;
  [key: string]: unknown;
}): Promise<{ slackFired: boolean; whatsappFired: boolean }> {
  let slackFired = false;
  let whatsappFired = false;

  if ((metrics.safetyMismatchRate ?? 0) > 0.01) {
    await sendSlackAlert("Safety mismatch spike detected");
    slackFired = true;
  }

  if ((metrics.latency ?? 0) > 3000) {
    await sendWhatsAppAlert("High latency detected");
    whatsappFired = true;
  }

  return { slackFired, whatsappFired };
}
