/**
 * ConversationPanel.tsx
 *
 * Slots into TelemedicineDoctorDashboard as the "Chat" tab in SessionDetailPanel.
 * Fetches the full session individually (draftReply + conversation[]) since the
 * dashboard's flat session list deliberately omits those fields.
 *
 * Endpoints:
 *   GET  /api/telemed/session/:caseId              → full session with draftReply + conversation
 *   POST /api/telemed/session/:caseId/doctor-reply { text } → send, clears draftReply
 *   PATCH /api/telemed/session/:caseId/draft        { text } → save draft edits
 *   POST /api/telemed/session/:caseId/generate-draft { hint? } → regenerate AI draft
 *   POST /api/telemed/discharge/:caseId             { patientName? } → close session
 */

import { useRef, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button }   from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge }    from "@/components/ui/badge";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  RefreshCw,
  User,
  X,
  Sparkles,
  MessageSquare,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConversationMessage {
  id:         string;
  sender:     "patient" | "doctor" | "system";
  text:       string;
  timestamp:  string;
  isAiDraft?: boolean;
}

interface FullSession {
  caseId:       string;
  status:       "active" | "completed" | "discharged";
  complaint?:   string;
  draftReply:   string;
  conversation: ConversationMessage[];
  patientInfo?: { age?: number; sex?: string };
  redFlags:     string[];
}

export interface ConversationPanelProps {
  caseId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function senderLabel(sender: string) {
  switch (sender) {
    case "patient": return "Patient";
    case "doctor":  return "Physician";
    case "system":  return "System";
    default:        return sender;
  }
}

function senderStyle(sender: string) {
  switch (sender) {
    case "patient": return "bg-gray-100 text-gray-800 self-start";
    case "doctor":  return "bg-blue-600 text-white self-end";
    case "system":  return "bg-amber-50 text-amber-800 border border-amber-200 self-start";
    default:        return "bg-gray-100 text-gray-800 self-start";
  }
}

function senderIcon(sender: string) {
  switch (sender) {
    case "patient": return <User className="h-3 w-3 shrink-0" />;
    case "doctor":  return <User className="h-3 w-3 shrink-0" />;
    case "system":  return <Bot  className="h-3 w-3 shrink-0" />;
    default:        return null;
  }
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConversationPanel({ caseId }: ConversationPanelProps) {
  const qc = useQueryClient();

  const [draftText,     setDraftText]     = useState("");
  const [isDraftEdited, setIsDraftEdited] = useState(false);
  const [sendError,     setSendError]     = useState<string | null>(null);
  const [isClosed,      setIsClosed]      = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Full session — default fetcher handles GET + JSON parse via queryKey URL
  const sessionQuery = useQuery<FullSession>({
    queryKey:        [`/api/telemed/session/${caseId}`],
    refetchInterval: 10_000,
    enabled:         !!caseId,
  });

  const session = sessionQuery.data;

  // Sync draftText from server when session reloads and physician hasn't edited
  useEffect(() => {
    if (session?.draftReply && !isDraftEdited) {
      setDraftText(session.draftReply);
    }
  }, [session?.draftReply, isDraftEdited]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.conversation?.length]);

  // ── Approve & send ──────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/telemed/session/${caseId}/doctor-reply`, {
        text: draftText.trim(),
      }),
    onSuccess: () => {
      setDraftText("");
      setIsDraftEdited(false);
      setSendError(null);
      sessionQuery.refetch();
      qc.invalidateQueries({ queryKey: ["/api/telemed/sessions"] });
    },
    onError: (err: Error) => {
      setSendError(err.message ?? "Failed to send reply");
    },
  });

  // ── Save draft edits ────────────────────────────────────────────────────────
  const saveDraftMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/telemed/session/${caseId}/draft`, {
        text: draftText,
      }),
    onSuccess: () => {
      setIsDraftEdited(false);
      sessionQuery.refetch();
    },
  });

  // ── Regenerate AI draft ─────────────────────────────────────────────────────
  const regenerateMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/telemed/session/${caseId}/generate-draft`, {}),
    onSuccess: () => {
      setIsDraftEdited(false);
      sessionQuery.refetch();
    },
  });

  // ── Close / discharge session ───────────────────────────────────────────────
  const closeMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/telemed/discharge/${caseId}`, {}),
    onSuccess: () => {
      setIsClosed(true);
      qc.invalidateQueries({ queryKey: ["/api/telemed/sessions"] });
      qc.invalidateQueries({ queryKey: ["/api/telemed/sessions/all"] });
    },
  });

  const handleDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraftText(e.target.value);
    setIsDraftEdited(true);
    setSendError(null);
  };

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (sessionQuery.isLoading) {
    return (
      <div className="space-y-3 animate-pulse p-2">
        {[0.6, 1, 0.75, 0.9, 0.5].map((w, i) => (
          <div key={i} className="h-8 bg-gray-100 rounded" style={{ width: `${w * 100}%` }} />
        ))}
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (sessionQuery.isError || !session) {
    return (
      <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-3">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Failed to load session.{" "}
        <button onClick={() => sessionQuery.refetch()} className="underline font-medium">
          Retry
        </button>
      </div>
    );
  }

  const isSessionClosed =
    isClosed ||
    session.status === "completed" ||
    session.status === "discharged";

  return (
    <div className="flex flex-col gap-3">

      {/* Red flag banner */}
      {session.redFlags?.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-300 rounded p-2" data-testid="banner-red-flags">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Red flags: </span>
            {session.redFlags.join(" · ")}
          </div>
        </div>
      )}

      {/* Status row + close button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs text-gray-500">
            {session.conversation?.length ?? 0} message{session.conversation?.length !== 1 ? "s" : ""}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
            isSessionClosed
              ? "bg-slate-100 text-slate-600 border-slate-200"
              : "bg-green-50 text-green-700 border-green-200"
          }`}>
            {isSessionClosed ? "Closed" : "Active"}
          </span>
        </div>

        {!isSessionClosed && (
          <button
            onClick={() => closeMutation.mutate()}
            disabled={closeMutation.isPending}
            className="flex items-center gap-1 rounded-xl border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-all"
            data-testid="btn-close-session"
          >
            {closeMutation.isPending
              ? <RefreshCw className="h-3 w-3 animate-spin" />
              : <X className="h-3 w-3" />
            }
            Close Session
          </button>
        )}
      </div>

      {/* Conversation thread */}
      <div
        ref={scrollRef}
        className="flex flex-col gap-2 max-h-64 overflow-y-auto bg-gray-50 border border-gray-200 rounded p-2"
        data-testid="conversation-thread"
      >
        {(!session.conversation || session.conversation.length === 0) && (
          <p className="text-xs text-gray-400 text-center py-4">
            No messages yet. Patient messages will appear here.
          </p>
        )}

        {session.conversation?.map((msg, i) => (
          <div
            key={msg.id ?? i}
            className={`flex flex-col max-w-[85%] rounded-lg px-3 py-2 text-xs ${senderStyle(msg.sender)}`}
            data-testid={`msg-${i}`}
          >
            <div className="flex items-center gap-1 mb-0.5 opacity-70">
              {senderIcon(msg.sender)}
              <span className="font-medium text-[10px]">{senderLabel(msg.sender)}</span>
              <span className="text-[10px] ml-auto">{formatTime(msg.timestamp)}</span>
              {msg.isAiDraft && (
                <span className="rounded-full border border-purple-200 bg-purple-100 px-1.5 py-0 text-[9px] text-purple-700 ml-1">AI draft</span>
              )}
            </div>
            <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
          </div>
        ))}
      </div>

      {/* Draft reply */}
      {!isSessionClosed && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-xs font-medium text-slate-700">AI Draft Reply</span>
              {isDraftEdited && (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0 text-[10px] text-amber-700">Edited</span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {isDraftEdited && (
                <button
                  onClick={() => saveDraftMutation.mutate()}
                  disabled={saveDraftMutation.isPending}
                  className="rounded-xl px-2.5 py-1 text-[10px] font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50"
                  data-testid="btn-save-draft"
                >
                  {saveDraftMutation.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Save draft"}
                </button>
              )}
              <button
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending}
                className="rounded-xl px-2.5 py-1 text-[10px] font-semibold text-purple-600 hover:text-purple-800 hover:bg-purple-50 transition-all disabled:opacity-50"
                data-testid="btn-regenerate-draft"
                title="Regenerate AI draft"
              >
                <RefreshCw className={`h-3 w-3 ${regenerateMutation.isPending ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <Textarea
            value={draftText}
            onChange={handleDraftChange}
            rows={5}
            placeholder={
              regenerateMutation.isPending
                ? "Generating AI draft…"
                : "AI draft will appear here. Edit freely before sending."
            }
            disabled={regenerateMutation.isPending}
            className="text-xs bg-white border-purple-200 focus:border-purple-400 resize-y"
            data-testid="textarea-draft-reply"
          />

          {sendError && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {sendError}
            </div>
          )}

          <button
            onClick={() => sendMutation.mutate()}
            disabled={!draftText.trim() || sendMutation.isPending || regenerateMutation.isPending}
            className="w-full rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            data-testid="btn-approve-send"
          >
            {sendMutation.isPending ? (
              <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Sending…</>
            ) : (
              <><CheckCircle2 className="h-3.5 w-3.5" /> Approve &amp; Send to Patient</>
            )}
          </button>

          <p className="text-[10px] text-slate-400 text-center">
            Physician review required before every send. AI drafts are never auto-sent.
          </p>
        </div>
      )}

      {/* Closed state */}
      {isSessionClosed && (
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-3">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
          Session closed. No further messages can be sent.
        </div>
      )}

    </div>
  );
}
