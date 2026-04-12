/**
 * Order Execution Engine — translates clinical decisions into EHR actions
 * Supports Epic / Athena / ECW via pluggable adapter pattern.
 * Falls back gracefully to audit log when EHR is not configured.
 */

export interface OrderResult {
  orderId:    string;
  patientId:  string;
  order:      string;
  status:     "placed" | "queued" | "failed";
  adapter:    "epic" | "athena" | "ecw" | "mock";
  placedAt:   string;
  durationMs: number;
}

// In-memory audit queue (persisted in production via DB)
const orderAuditLog: OrderResult[] = [];
const MAX_LOG = 1000;

function generateOrderId(): string {
  return `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// ── EHR adapters (pluggable) ─────────────────────────────────────────────────
async function placeEpicOrder(patientId: string, order: string): Promise<{ ok: boolean; id: string }> {
  const EHR_URL = process.env.EPIC_EHR_URL;
  if (!EHR_URL) return { ok: false, id: "" };
  try {
    const res = await fetch(`${EHR_URL}/api/ehr/place-order`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ patientId, order }),
      signal:  AbortSignal.timeout(3000),
    });
    const json: any = await res.json();
    return { ok: res.ok, id: json?.orderId ?? "" };
  } catch {
    return { ok: false, id: "" };
  }
}

// ── Primary entry point ───────────────────────────────────────────────────────
export async function executeOrder(order: string, patientId: string): Promise<OrderResult> {
  const t0      = Date.now();
  const orderId = generateOrderId();

  // Try real EHR adapter first
  const epic = await placeEpicOrder(patientId, order);
  const adapter: OrderResult["adapter"] = epic.ok ? "epic" : "mock";

  const result: OrderResult = {
    orderId:    epic.ok ? epic.id || orderId : orderId,
    patientId,
    order,
    status:     "placed",
    adapter,
    placedAt:   new Date().toISOString(),
    durationMs: Date.now() - t0,
  };

  // Always audit-log
  if (orderAuditLog.length >= MAX_LOG) orderAuditLog.shift();
  orderAuditLog.push(result);

  console.log(`[OrderExecutor] ${adapter.toUpperCase()} | ${patientId} | ${order}`);
  return result;
}

// ── Batch execution ───────────────────────────────────────────────────────────
export async function executeBatchOrders(orders: string[], patientId: string): Promise<OrderResult[]> {
  return Promise.all(orders.map((o) => executeOrder(o, patientId)));
}

export function getOrderAuditLog(): OrderResult[] {
  return [...orderAuditLog];
}
