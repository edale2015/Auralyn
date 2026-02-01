import { getStore } from "../intakeStorage";

const store = getStore();

const token = process.argv[2] || `TEST_TOKEN_${Date.now()}`;
const code = process.argv[3] || "123456";
const expiresMinutes = Number(process.argv[4]) || 30;

const expiresAt = Date.now() + expiresMinutes * 60 * 1000;

async function main() {
  await store.createSession(token, code, expiresAt);

  console.log("Created test intake session:");
  console.log({
    token,
    code,
    expiresAt: new Date(expiresAt).toISOString(),
    url: `/simple/${token}`
  });
  console.log(`\nTo use: navigate to /simple/${token} and enter code ${code}`);
}

main().catch(console.error);
