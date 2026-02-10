const commandCounts = new Map<string, { count: number; windowStart: number }>();

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

export function isTestConsoleEnabled(): boolean {
  if (process.env.ENABLE_TEST_CONSOLE === "0") return false;
  if (process.env.ENABLE_TEST_CONSOLE === "1") return true;
  if (process.env.NODE_ENV === "production") return false;
  return true;
}

export function checkStaffCommandAccess(phoneNumber: string, adminToken?: string): { allowed: boolean; reason?: string } {
  if (!isTestConsoleEnabled()) {
    return { allowed: false, reason: "Test console is disabled. Set ENABLE_TEST_CONSOLE=1 to enable." };
  }

  if (process.env.NODE_ENV === "production" && process.env.ADMIN_TOKEN) {
    if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
      return { allowed: false, reason: "Production mode requires valid ADMIN_TOKEN." };
    }
  }

  const now = Date.now();
  const key = phoneNumber.replace(/\D/g, "");
  const entry = commandCounts.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    commandCounts.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= MAX_PER_WINDOW) {
    const remainSec = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);
    return { allowed: false, reason: `Rate limit exceeded (${MAX_PER_WINDOW}/min). Try again in ${remainSec}s.` };
  }

  entry.count++;
  return { allowed: true };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of commandCounts) {
    if (now - entry.windowStart > WINDOW_MS * 2) {
      commandCounts.delete(key);
    }
  }
}, WINDOW_MS * 5);
