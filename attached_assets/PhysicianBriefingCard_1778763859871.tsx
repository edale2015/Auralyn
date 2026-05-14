/**
 * AURALYN — Physician Briefing Card
 * 
 * This is what appears on the physician's phone or workstation
 * BEFORE they enter the exam room.
 * 
 * Design principles:
 *   - Everything critical visible without scrolling
 *   - Red/amber/green urgency is immediate and unambiguous
 *   - Gaps are ranked: MUST close vs SHOULD close
 *   - Story flags are prominent — changed answers need reconciliation
 *   - Suggested opener removes the cold-start cognitive load
 *   - One tap to pull up full dialogue transcript if needed
 *
 * File: client/src/components/physician/BriefingCard.tsx
 */

import { useState } from "react";

// Urgency color system
const URGENCY_CONFIG = {
  immediate: {
    bg: "bg-red-50 border-red-400",
    badge: "bg-red-500 text-white",
    label: "IMMEDIATE",
    icon: "⚠️",
  },
  expedite: {
    bg: "bg-orange-50 border-orange-300",
    badge: "bg-orange-500 text-white",
    label: "EXPEDITE",
    icon: "🔴",
  },
  watch: {
    bg: "bg-yellow-50 border-yellow-300",
    badge: "bg-yellow-500 text-white",
    label: "WATCH",
    icon: "🟡",
  },
  routine: {
    bg: "bg-green-50 border-green-300",
    badge: "bg-green-600 text-white",
    label: "ROUTINE",
    icon: "🟢",
  },
};

interface BriefingCardProps {
  encounterId: string;
  patientName: string;         // de-identified if needed
  roomNumber: string;
  onEnterRoom: () => void;
  onRequestFullTranscript: () => void;
}

interface BriefingData {
  oneLiner: string;
  urgencySignal: "routine" | "watch" | "expedite" | "immediate";
  preliminaryDisposition: string;
  topDifferential: string[];
  criticalGaps: string[];
  importantGaps: string[];
  storyFlags: string[];
  selfExamFindings: string[];
  medicationFlags: string[];
  suggestedFirstWords: string;
  dialogueDurationMinutes: number;
  turnsCompleted: number;
}

export function PhysicianBriefingCard({
  encounterId,
  patientName,
  roomNumber,
  onEnterRoom,
  onRequestFullTranscript,
}: BriefingCardProps) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch briefing data
  useState(() => {
    fetch(`/api/encounters/${encounterId}/briefing`)
      .then(r => r.json())
      .then(data => {
        setBriefing(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading patient briefing...</div>
      </div>
    );
  }

  if (!briefing) {
    return (
      <div className="p-4 border border-red-200 rounded-lg bg-red-50">
        <p className="text-red-700 font-medium">Briefing unavailable — patient may still be completing intake</p>
        <button onClick={onEnterRoom} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded">
          Enter room without briefing
        </button>
      </div>
    );
  }

  const urgency = URGENCY_CONFIG[briefing.urgencySignal];

  return (
    <div className={`border-2 rounded-xl overflow-hidden ${urgency.bg}`}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${urgency.badge}`}>
              {urgency.icon} {urgency.label}
            </span>
            <span className="text-sm font-medium text-gray-700">Room {roomNumber}</span>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Dialogue: {briefing.dialogueDurationMinutes} min · {briefing.turnsCompleted} exchanges
          </p>
        </div>
        <button
          onClick={onEnterRoom}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm"
        >
          Enter room →
        </button>
      </div>

      {/* ── One-liner ────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-200">
        <p className="font-medium text-gray-900 text-sm leading-snug">{briefing.oneLiner}</p>
      </div>

      {/* ── Preliminary disposition + differential ───────────────── */}
      <div className="px-4 py-3 border-b border-gray-200 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Preliminary disposition</p>
          <p className="text-sm font-medium text-gray-800">{briefing.preliminaryDisposition}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Top differential</p>
          <ul className="space-y-0.5">
            {briefing.topDifferential.map((dx, i) => (
              <li key={i} className="text-sm text-gray-800">
                {i + 1}. {dx}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── CRITICAL GAPS ────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-200">
        <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-2">
          Critical gaps — close before disposition
        </p>
        <ul className="space-y-1.5">
          {briefing.criticalGaps.map((gap, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
              <span className="text-red-500 mt-0.5 flex-shrink-0">▸</span>
              <span>{gap}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── STORY FLAGS ──────────────────────────────────────────── */}
      {briefing.storyFlags.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-200 bg-yellow-50">
          <p className="text-xs font-bold text-yellow-700 uppercase tracking-wide mb-2">
            Story flags — answers that changed
          </p>
          <ul className="space-y-1.5">
            {briefing.storyFlags.map((flag, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-yellow-900">
                <span className="text-yellow-600 mt-0.5 flex-shrink-0">⚑</span>
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── MEDICATION FLAGS ─────────────────────────────────────── */}
      {briefing.medicationFlags.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-200">
          <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-2">
            Medication flags
          </p>
          <ul className="space-y-1.5">
            {briefing.medicationFlags.map((flag, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
                <span className="text-purple-500 mt-0.5 flex-shrink-0">Rx</span>
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── SELF-EXAM FINDINGS ───────────────────────────────────── */}
      {briefing.selfExamFindings.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-200">
          <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">
            Self-exam findings (physician verification required)
          </p>
          <ul className="space-y-1.5">
            {briefing.selfExamFindings.map((finding, i) => (
              <li key={i} className="text-sm text-gray-800 italic">{finding}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── SUGGESTED OPENER ─────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-200 bg-blue-50">
        <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">
          Suggested opener
        </p>
        <p className="text-sm text-blue-900 italic">"{briefing.suggestedFirstWords}"</p>
      </div>

      {/* ── Footer actions ───────────────────────────────────────── */}
      <div className="px-4 py-3 flex gap-3">
        <button
          onClick={() => {
            setShowTranscript(!showTranscript);
            onRequestFullTranscript();
          }}
          className="text-sm text-blue-600 underline"
        >
          {showTranscript ? "Hide" : "View"} full dialogue transcript
        </button>
        <span className="text-gray-300">|</span>
        <button className="text-sm text-gray-600 underline">
          Override briefing
        </button>
      </div>

    </div>
  );
}

/**
 * STORY INCONSISTENCY EXPLANATION
 *
 * Patients change their answers. This is normal and expected, not deceptive.
 * The reasons:
 *
 * 1. QUESTION PHRASING EFFECT
 *    "Do you have a fever?" → "No"
 *    "Have you felt hot or warm at any point?" → "Well, maybe a little last night"
 *    Same clinical question, different framing, different answer.
 *    The system detects both answers and flags the discrepancy for the physician.
 *
 * 2. MEMORY RECONSTRUCTION
 *    Pain and symptoms are recalled differently depending on what question
 *    is asked before. Asking about nausea before asking about fever makes
 *    patients more likely to recall fever-related symptoms.
 *    The answer log preserves chronological order.
 *
 * 3. PAIN EVOLUTION
 *    "How long has it been hurting?" → "2 days"
 *    [10 minutes later] "Is the pain better or worse than when it started?"
 *    → "It started this morning actually, it got bad fast"
 *    The patient's internal timeline has just changed. Flag it.
 *
 * 4. SOCIAL DESIRABILITY
 *    "Do you smoke?" → "Not really" (smokes 5/day)
 *    "How many cigarettes per day?" → "About 5"
 *    Initial denial replaced by quantification when asked directly.
 *
 * How Auralyn handles this:
 *   - All answers logged with timestamp and question context
 *   - Changed answers surfaced in the story flags section
 *   - Clinically significant changes (fever, chest pain, syncope) flagged prominently
 *   - Physician sees the full answer history, not just the most recent
 *   - Suggested opener includes a note to verify changed answers
 *
 * This turns a clinical liability (patient gives inconsistent history)
 * into a clinical asset (physician already knows what to clarify and why).
 */
