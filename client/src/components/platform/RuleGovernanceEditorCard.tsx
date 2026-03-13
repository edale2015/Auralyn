import { useEffect, useState } from "react";
import { ruleEditorApi } from "../../lib/ruleEditorApi";

const KNOWN_RULE_KEYS = [
  "RED_FLAG_RULES.csv",
  "DISPOSITION_RULES.csv",
  "CLUSTER_SCORING_RULES.csv",
  "QUESTION_IMPACT.csv",
];

export default function RuleGovernanceEditorCard() {
  const [metadata, setMetadata] = useState<Record<string, any>>({});
  const [ruleKey, setRuleKey] = useState("RED_FLAG_RULES.csv");
  const [owner, setOwner] = useState("");
  const [statusText, setStatusText] = useState("active");
  const [complaintsText, setComplaintsText] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  async function load() {
    try {
      const res = await ruleEditorApi.getMetadata();
      setMetadata(res.result ?? {});
    } catch (err: any) {
      setStatus(err.message ?? "Failed to load governance metadata");
    }
  }

  function populateFromKey(key: string) {
    const rec = metadata[key];
    if (rec) {
      setOwner(rec.owner ?? "");
      setStatusText(rec.status ?? "active");
      setComplaintsText((rec.linkedComplaints ?? []).join(", "));
      setNotes(rec.notes ?? "");
    } else {
      setOwner("");
      setStatusText("active");
      setComplaintsText("");
      setNotes("");
    }
  }

  async function save() {
    try {
      setSaving(true);
      setStatus("Saving...");
      await ruleEditorApi.updateMetadata({
        ruleKey,
        owner,
        status: statusText,
        linkedComplaints: complaintsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        notes,
      });
      await load();
      setStatus("Saved.");
    } catch (err: any) {
      setStatus(err.message ?? "Failed to save metadata");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    populateFromKey(ruleKey);
  }, [ruleKey, metadata]);

  const savedKeys = Object.keys(metadata);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Rule Governance Editor</h2>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Rule key</label>
          <select
            data-testid="select-rule-key"
            value={ruleKey}
            onChange={(e) => setRuleKey(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          >
            {[...new Set([...KNOWN_RULE_KEYS, ...savedKeys])].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Owner</label>
          <input
            data-testid="input-rule-owner"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="e.g. clinical-ops"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
          <select
            data-testid="select-rule-status"
            value={statusText}
            onChange={(e) => setStatusText(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          >
            <option value="active">active</option>
            <option value="under_review">under_review</option>
            <option value="deprecated">deprecated</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Linked complaints (comma-separated)
          </label>
          <input
            data-testid="input-rule-complaints"
            value={complaintsText}
            onChange={(e) => setComplaintsText(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="sore_throat, cough, uti"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
          <textarea
            data-testid="textarea-rule-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[72px] w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="Review notes..."
          />
        </div>

        <button
          data-testid="button-rule-save"
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {!!status && (
        <div className="mt-3 text-sm text-slate-600">{status}</div>
      )}

      {savedKeys.length > 0 && (
        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          <div className="mb-1 text-xs font-medium text-slate-600">
            Saved records ({savedKeys.length})
          </div>
          <pre className="overflow-auto text-xs text-slate-700">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
