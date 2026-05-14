// AURALYN — Physician Briefing Banner
// Drop this into the top of the existing Clinical Encounter page
// It reads the pre-encounter dialogue and shows the physician a briefing
// before they interact with the clinical encounter form.
//
// Integration: In client/src/pages/ClinicalEncounter.tsx (or equivalent),
// add <BriefingBanner encounterId={encounterId}/> just below the
// "Clinical Encounter" header and above the chief complaint section.

import { useState, useEffect } from "react";

const URGENCY_STYLE = {
  immediate: { border:"#ef4444", bg:"#fef2f2", badge:"#ef4444", label:"IMMEDIATE" },
  expedite:  { border:"#f97316", bg:"#fff7ed", badge:"#f97316", label:"EXPEDITE" },
  watch:     { border:"#f59e0b", bg:"#fffbeb", badge:"#f59e0b", label:"WATCH" },
  routine:   { border:"#22c55e", bg:"#f0fdf4", badge:"#22c55e", label:"ROUTINE" },
};

export function BriefingBanner({ encounterId }) {
  const [briefing, setBriefing] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!encounterId) { setLoading(false); return; }
    fetch(`/api/encounters/${encounterId}/briefing`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setBriefing(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [encounterId]);

  if (loading || !briefing?.available) return null;

  const urgency = briefing.urgency_signal || "routine";
  const style = URGENCY_STYLE[urgency] || URGENCY_STYLE.routine;

  const acknowledge = () => {
    setAcknowledged(true);
    setExpanded(false);
    fetch(`/api/encounters/${encounterId}/briefing/acknowledge`, { method: "POST" });
  };

  return (
    <div style={{
      border: `2px solid ${style.border}`,
      borderRadius: 10,
      background: style.bg,
      marginBottom: 16,
      overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {/* Header row — always visible */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          borderBottom: expanded ? `1px solid ${style.border}30` : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            background: style.badge, color: "#fff",
            fontSize: 10, fontWeight: 700, letterSpacing: "1px",
            padding: "2px 8px", borderRadius: 4,
          }}>
            PRE-ENCOUNTER · {style.label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>
            {briefing.one_liner}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {acknowledged && (
            <span style={{ fontSize: 11, color: "#6b7280" }}>✓ Reviewed</span>
          )}
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: "12px 14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            {/* Preliminary disposition */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>
                Preliminary disposition
              </div>
              <div style={{ fontSize: 13, color: "#111827", fontWeight: 500 }}>
                {briefing.preliminary_disposition}
              </div>
            </div>
            {/* Top differential */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>
                Top differential
              </div>
              {(briefing.top_differential || []).slice(0,3).map((dx, i) => (
                <div key={i} style={{ fontSize: 13, color: "#111827" }}>
                  {i+1}. {dx}
                </div>
              ))}
            </div>
          </div>

          {/* Critical gaps */}
          {briefing.critical_gaps?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>
                Critical gaps — close before disposition
              </div>
              {briefing.critical_gaps.slice(0,4).map((gap, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                  <span style={{ color: "#dc2626", fontSize: 10, marginTop: 2, flexShrink: 0 }}>▸</span>
                  <span style={{ fontSize: 12, color: "#374151", lineHeight: 1.4 }}>{gap}</span>
                </div>
              ))}
            </div>
          )}

          {/* Story flags */}
          {briefing.story_flags?.length > 0 && (
            <div style={{
              background: "#fefce8", border: "1px solid #fde047",
              borderRadius: 6, padding: "8px 10px", marginBottom: 10,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#713f12", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>
                Story flags
              </div>
              {briefing.story_flags.slice(0,3).map((flag, i) => (
                <div key={i} style={{ fontSize: 12, color: "#713f12", marginBottom: 2, lineHeight: 1.4 }}>
                  ⚑ {flag}
                </div>
              ))}
            </div>
          )}

          {/* Medication flags */}
          {briefing.medication_flags?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>
                Medication flags
              </div>
              {briefing.medication_flags.map((flag, i) => (
                <div key={i} style={{ fontSize: 12, color: "#374151", marginBottom: 3, lineHeight: 1.4 }}>
                  Rx {flag}
                </div>
              ))}
            </div>
          )}

          {/* Suggested opener */}
          {briefing.suggested_first_words && (
            <div style={{
              background: "#eff6ff", border: "1px solid #bfdbfe",
              borderRadius: 6, padding: "8px 10px", marginBottom: 12,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#1e40af", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>
                Suggested opener
              </div>
              <div style={{ fontSize: 12, color: "#1e3a8a", fontStyle: "italic", lineHeight: 1.5 }}>
                "{briefing.suggested_first_words}"
              </div>
            </div>
          )}

          {/* Action row */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={acknowledge}
              style={{
                padding: "6px 14px", background: style.badge, color: "#fff",
                border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ✓ Reviewed — enter room
            </button>
            <button
              onClick={() => window.open(`/dialogue-transcript/${encounterId}`, "_blank")}
              style={{
                padding: "6px 14px", background: "none",
                border: `1px solid ${style.border}`, color: "#374151",
                borderRadius: 6, fontSize: 12, cursor: "pointer",
              }}
            >
              Full transcript
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Living encounter timeline for physician view ──────────────────────────
// Add this to the encounter page to show post-visit patient updates
export function LivingEncounterTimeline({ encounterId }) {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!encounterId) return;
    fetch(`/api/encounters/${encounterId}/timeline`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setUpdates(data?.updates || []); setLoading(false); })
      .catch(() => setLoading(false));

    // Poll every 60 seconds for new updates
    const interval = setInterval(() => {
      fetch(`/api/encounters/${encounterId}/timeline`)
        .then(r => r.ok ? r.json() : null)
        .then(data => setUpdates(data?.updates || []))
        .catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [encounterId]);

  if (loading || updates.length === 0) return null;

  const hasAlert = updates.some(u => u.physician_alerted && !u.resolved);
  const unresolved = updates.filter(u => !u.resolved).length;

  const colorMap = {
    improvement: "#16a34a", worsening: "#dc2626",
    new_symptom: "#d97706", question: "#2563eb", resolved: "#16a34a",
  };

  return (
    <div style={{
      border: `2px solid ${hasAlert ? "#ef4444" : "#e5e7eb"}`,
      borderRadius: 10,
      background: hasAlert ? "#fef2f2" : "#f9fafb",
      marginTop: 12,
      overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "10px 14px", display: "flex", alignItems: "center",
          justifyContent: "space-between", cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {hasAlert && (
            <span style={{
              background: "#ef4444", color: "#fff", fontSize: 10,
              fontWeight: 700, padding: "2px 7px", borderRadius: 4, letterSpacing: "0.5px",
            }}>
              ALERT
            </span>
          )}
          <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
            Living encounter — {updates.length} patient update{updates.length!==1?"s":""}
          </span>
          {unresolved > 0 && (
            <span style={{
              background: "#ef4444", color: "#fff", fontSize: 11,
              fontWeight: 700, width: 20, height: 20, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {unresolved}
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: "#6b7280" }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 14px 14px" }}>
          {updates.map((u, i) => (
            <div key={i} style={{
              padding: "10px 0",
              borderTop: i > 0 ? "1px solid #e5e7eb" : "none",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: colorMap[u.update_type] || "#6b7280",
                  }}/>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                    {new Date(u.updated_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
                    })}
                  </span>
                  {u.physician_alerted && !u.resolved && (
                    <span style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 5px", borderRadius: 3, fontWeight: 600 }}>
                      Needs response
                    </span>
                  )}
                </div>
                {u.physician_alerted && !u.resolved && (
                  <button
                    onClick={() => {
                      fetch(`/api/encounters/updates/${u.id}/resolve`, { method: "POST" });
                      setUpdates(prev => prev.map(up => up.id === u.id ? {...up, resolved: true} : up));
                    }}
                    style={{
                      fontSize: 11, padding: "3px 8px", background: "#f3f4f6",
                      border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", color: "#374151",
                    }}
                  >
                    Mark resolved
                  </button>
                )}
              </div>
              <div style={{ fontSize: 13, color: "#111827", lineHeight: 1.5, marginLeft: 14 }}>
                {u.patient_message}
              </div>
              {u.new_disposition && u.disposition_changed && (
                <div style={{ fontSize: 12, color: "#7c3aed", marginLeft: 14, marginTop: 4, fontWeight: 500 }}>
                  → Disposition updated: {u.new_disposition}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
