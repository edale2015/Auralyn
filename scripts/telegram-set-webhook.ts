const token = process.env.TELEGRAM_BOT_TOKEN;
const base = process.env.PUBLIC_BASE_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

async function main() {
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN not set");
    process.exit(1);
  }
  if (!base) {
    console.error("PUBLIC_BASE_URL not set");
    process.exit(1);
  }

  const url = `https://api.telegram.org/bot${token}/setWebhook`;
  const webhookUrl = `${base}/telegram/webhook`;

  console.log(`Setting webhook to: ${webhookUrl}`);

  const body: Record<string, string> = { url: webhookUrl };
  if (secret) body.secret_token = secret;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const result = await res.text();
  console.log(`Response (${res.status}):`, result);
}

main();
