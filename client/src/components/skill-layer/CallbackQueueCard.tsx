import { useState } from "react";
import { skillLayerApi } from "../../lib/skillLayerApi";

type Props = {
  context?: any;
};

export default function CallbackQueueCard({ context }: Props) {
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleQueue() {
    if (!context) {
      setStatus("No case context available yet. Run a case first.");
      return;
    }
    try {
      setLoading(true);
      const res = await skillLayerApi.enqueueCallback(context);
      setStatus(
        res.queued
          ? `Queued callback: ${res.callback_id}`
          : "No callback needed for this case."
      );
    } catch (err: any) {
      setStatus(err.message ?? "Failed to queue callback");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Callback Queue</h2>

      <button
        data-testid="button-queue-callback"
        onClick={handleQueue}
        disabled={loading}
        className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Queuing…" : "Queue callback if needed"}
      </button>

      {!!status && (
        <div data-testid="callback-status" className="mt-3 text-sm text-slate-600">
          {status}
        </div>
      )}
    </div>
  );
}
