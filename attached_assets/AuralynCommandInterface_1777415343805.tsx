/**
 * AuralynCommandInterface.tsx
 * Drop into: client/src/components/AuralynCommandInterface.tsx
 *
 * Architecture 7 interaction layer for Auralyn.
 * Physician expresses intent in natural language.
 * System orchestrates across all nine subsystems we built.
 *
 * This component calls POST /api/command with the physician's natural language
 * input and renders the orchestrated result — no navigation required.
 *
 * Keyboard shortcut: Cmd/Ctrl+K opens the command interface from anywhere.
 *
 * Usage: Add to your root layout so it's available on every page:
 *   <AuralynCommandInterface physicianId={currentUser.id} />
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  Loader2,
  X,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Terminal,
  ArrowRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommandAction {
  type:        string;     // "approve_case" | "send_discharge" | "econsult" | "enroll_followup" | etc.
  label:       string;     // human readable e.g. "Approve case C-001"
  status:      "pending" | "running" | "complete" | "failed";
  result?:     string;     // result summary
  error?:      string;
}

interface CommandResponse {
  ok:           boolean;
  intent:       string;    // what the system understood
  actions:      CommandAction[];
  summary:      string;    // plain English summary of what was done
  requiresConfirmation: boolean;
  confirmationPrompt?:  string;
  error?:       string;
}

// Suggested commands shown in the idle state
const SUGGESTIONS = [
  { label: "Show urgent queue",          icon: "🔴", command: "show me all urgent cases waiting for review" },
  { label: "Async cases only",           icon: "📋", command: "show async safe cases I can batch review" },
  { label: "My performance this week",   icon: "📊", command: "how am I doing this week vs benchmarks" },
  { label: "Follow-up escalations",      icon: "⚠️",  command: "show patients who need follow-up attention" },
];

// ─── Command step display ─────────────────────────────────────────────────────

function ActionStep({ action, index }: { action: CommandAction; index: number }) {
  return (
    <div
      className="flex items-start gap-3 py-2"
      style={{ animationDelay: `${index * 80}ms` }}
      data-testid={`action-step-${index}`}
    >
      {/* Status indicator */}
      <div className="shrink-0 mt-0.5">
        {action.status === "complete" && (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        )}
        {action.status === "running" && (
          <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
        )}
        {action.status === "pending" && (
          <div className="h-4 w-4 rounded-full border border-gray-600" />
        )}
        {action.status === "failed" && (
          <AlertTriangle className="h-4 w-4 text-red-400" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm ${
          action.status === "complete" ? "text-gray-200" :
          action.status === "running"  ? "text-blue-300" :
          action.status === "failed"   ? "text-red-300"  :
          "text-gray-500"
        }`}>
          {action.label}
        </p>
        {action.result && (
          <p className="text-xs text-gray-500 mt-0.5">{action.result}</p>
        )}
        {action.error && (
          <p className="text-xs text-red-400 mt-0.5">{action.error}</p>
        )}
      </div>

      <Badge
        className={`text-[10px] shrink-0 ${
          action.status === "complete" ? "bg-emerald-900 text-emerald-300 border-emerald-700" :
          action.status === "running"  ? "bg-blue-900 text-blue-300 border-blue-700" :
          action.status === "failed"   ? "bg-red-900 text-red-300 border-red-700" :
          "bg-gray-800 text-gray-500 border-gray-700"
        }`}
        variant="outline"
      >
        {action.status}
      </Badge>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AuralynCommandInterface({ physicianId }: { physicianId?: string }) {
  const [isOpen,       setIsOpen]       = useState(false);
  const [input,        setInput]        = useState("");
  const [response,     setResponse]     = useState<CommandResponse | null>(null);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [history,      setHistory]      = useState<string[]>([]);
  const [historyIdx,   setHistoryIdx]   = useState(-1);

  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const qc         = useQueryClient();

  // ── Keyboard shortcut: Cmd/Ctrl+K ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setInput("");
      setResponse(null);
      setShowConfirm(false);
      setHistoryIdx(-1);
    }
  }, [isOpen]);

  // ── Command execution ─────────────────────────────────────────────────────
  const commandMutation = useMutation({
    mutationFn: (commandText: string) =>
      apiRequest<CommandResponse>("POST", "/api/command", {
        command:     commandText,
        physicianId: physicianId ?? "phys1",
        confirmed:   showConfirm,
      }),
    onSuccess: (data) => {
      setResponse(data);
      if (data.requiresConfirmation && !showConfirm) {
        setShowConfirm(true);
      } else {
        // Invalidate relevant queries so UI updates automatically
        qc.invalidateQueries({ queryKey: ["/api/review/queue"] });
        qc.invalidateQueries({ queryKey: ["/api/telemed/sessions"] });
        qc.invalidateQueries({ queryKey: ["/api/followup/enrollments"] });
        qc.invalidateQueries({ queryKey: ["/api/provider/feedback"] });
      }
    },
  });

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || commandMutation.isPending) return;
    setHistory(prev => [trimmed, ...prev.slice(0, 19)]);
    setHistoryIdx(-1);
    setResponse(null);
    setShowConfirm(false);
    commandMutation.mutate(trimmed);
  }, [input, commandMutation, showConfirm]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    // Arrow up/down for history
    if (e.key === "ArrowUp" && history.length > 0) {
      e.preventDefault();
      const idx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(idx);
      setInput(history[idx]);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(idx);
      setInput(idx === -1 ? "" : history[idx]);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-6 z-40 flex items-center gap-2 px-3 py-2 rounded-full
                   bg-gray-900 border border-gray-700 text-gray-400 text-xs hover:text-gray-200
                   hover:border-gray-500 transition-all shadow-lg group"
        data-testid="btn-command-open"
        title="Open Auralyn Command Interface (⌘K)"
      >
        <Terminal className="h-3.5 w-3.5 group-hover:text-blue-400 transition-colors" />
        <span className="hidden sm:inline">Command</span>
        <kbd className="hidden sm:inline text-[10px] bg-gray-800 border border-gray-700 rounded px-1">⌘K</kbd>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />

      {/* Command panel */}
      <div
        className="fixed top-[10vh] left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl
                   bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl
                   overflow-hidden flex flex-col"
        style={{ maxHeight: "80vh" }}
        data-testid="command-interface"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-400" />
            <span className="text-xs font-semibold text-gray-300 uppercase tracking-widest">
              Auralyn Command
            </span>
            <Badge
              variant="outline"
              className="text-[9px] text-blue-400 border-blue-800 bg-blue-950"
            >
              Architecture 7
            </Badge>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-600 hover:text-gray-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Input area */}
        <div className="px-4 py-3 border-b border-gray-800/50">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What do you need? e.g. 'Approve the UTI case and send discharge instructions' or 'Show me escalated follow-ups'"
            className="w-full bg-transparent text-gray-100 text-sm placeholder:text-gray-600
                       resize-none outline-none leading-relaxed"
            rows={2}
            data-testid="command-input"
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-[10px] text-gray-600">
              ↑↓ history · Shift+Enter for new line · Enter to execute
            </p>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!input.trim() || commandMutation.isPending}
              className="h-7 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3"
              data-testid="btn-command-submit"
            >
              {commandMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <><ArrowRight className="h-3.5 w-3.5 mr-1" />Execute</>
              }
            </Button>
          </div>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

          {/* Suggestions — shown when no response yet */}
          {!response && !commandMutation.isPending && (
            <div className="space-y-1">
              <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
                Suggested commands
              </p>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(s.command); inputRef.current?.focus(); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg
                             text-left text-sm text-gray-400 hover:text-gray-200
                             hover:bg-gray-800/60 transition-colors group"
                  data-testid={`suggestion-${i}`}
                >
                  <span className="text-base">{s.icon}</span>
                  <span>{s.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}

          {/* Loading state */}
          {commandMutation.isPending && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 text-blue-400 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Interpreting intent and orchestrating actions…</span>
              </div>
              <div className="space-y-1.5 animate-pulse">
                {[0.6, 0.8, 0.5].map((w, i) => (
                  <div key={i} className="h-3 bg-gray-800 rounded" style={{ width: `${w * 100}%` }} />
                ))}
              </div>
            </div>
          )}

          {/* Response */}
          {response && !commandMutation.isPending && (
            <div className="space-y-4">

              {/* Intent confirmation */}
              <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-900 rounded-lg px-3 py-2">
                <Sparkles className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                <span><span className="text-gray-500">Understood: </span>{response.intent}</span>
              </div>

              {/* Confirmation gate */}
              {response.requiresConfirmation && !showConfirm && (
                <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg px-4 py-3 space-y-3">
                  <p className="text-sm text-amber-300">{response.confirmationPrompt}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setShowConfirm(true);
                        commandMutation.mutate(input);
                      }}
                      className="bg-amber-600 hover:bg-amber-500 text-white text-xs h-7"
                      data-testid="btn-confirm"
                    >
                      Confirm & Execute
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setResponse(null); setInput(""); }}
                      className="text-gray-400 text-xs h-7"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Action steps */}
              {response.actions?.length > 0 && (
                <div className="space-y-0 divide-y divide-gray-800/50">
                  {response.actions.map((action, i) => (
                    <ActionStep key={i} action={action} index={i} />
                  ))}
                </div>
              )}

              {/* Summary */}
              {response.summary && (
                <div className="bg-gray-900 rounded-lg px-4 py-3">
                  <p className="text-sm text-gray-300 leading-relaxed">{response.summary}</p>
                </div>
              )}

              {/* Error */}
              {response.error && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg p-3">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {response.error}
                </div>
              )}

              {/* Follow-up prompt */}
              {!response.error && (
                <button
                  onClick={() => { setInput(""); setResponse(null); inputRef.current?.focus(); }}
                  className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                >
                  + Another command
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
