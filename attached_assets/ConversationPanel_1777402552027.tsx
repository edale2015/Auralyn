/**
 * ConversationPanel.tsx
 * Drop into: client/src/components/ConversationPanel.tsx
 *
 * Slots into TelemedicineDoctorDashboard as a new "Chat" tab in SessionDetailPanel.
 * Fetches the full session (including draftReply + conversation[]) individually
 * since the dashboard's flat session list deliberately omits those fields.
 *
 * Endpoints used:
 *   GET  /api/telemed/session/:caseId          → full session with draftReply + conversation
 *   POST /api/telemed/session/:caseId/doctor-reply  { text } → send, clears draftReply
 *   PATCH /api/telemed/session/:caseId/draft   { text } → save draft edits
 *   POST /api/telemed/session/:caseId/generate-draft { hint? } → regenerate AI draft
 *   POST /api/telemed/discharge/:caseId        { patientName? } → close session
 *
 * Cache invalidation: ["/api/telemed/sessions"] after every mutation
 * so the parent dashboard list reflects updated status immediately.
 *
 * Usage in TelemedicineDoctorDashboard.tsx:
 *   1. Import ConversationPanel
 *   2. Add a "Chat" tab to the existing TabsList
 *   3. Add <TabsContent value="chat"><ConversationPanel caseId={selected.caseId} /></TabsContent>
 *
 * Type extension needed in TelemedicineDoctorDashboard.tsx:
 *   Add to the local Session type:
 *     draftReply?: string
 *     status: "active" | "completed" | "discharged"
 *   (or import FullSession from this file)
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
  Send,
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

interface ConversationPanelProps {
  /** caseId of the session currently selected in the dashboard */
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
    case "system":  return "bg-amber-50 text-amber-800 self-start border border-amber-200";
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
  return new Date(ts).toLocaleTimeString("en-US", {
    hour:   "numeric",
    minute: "2-digit",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConversationPanel({ caseId }: ConversationPanelProps) {
  const qc = useQueryClient();

  const [draftText,     setDraftText]     = useState("");
  const [isDraftEdited, setIsDraftEdited] = useState(false);
  const [sendError,     setSendError]     = useState<string | null>(null);
  const [isClosed,      setIsClosed]      = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Fetch full session (includes draftReply + conversation) ─────────────────
  const sessionQuery = useQuery({
    queryKey:      [`/api/telemed/session/${caseId}`],
    queryFn:       () => apiRequest<FullSession>("GET", `/api/telemed/session/${caseId}`),
    refetchInterval: 10_000,   // poll every 10s for new patient messages
    enabled:       !!caseId,
  });

  const session = sessionQuery.data;

  // Sync draftText from server whenever session reloads and physician hasn't edited
  useEffect(() => {
    if (session?.draftReply && !isDraftEdited) {
      setDraftText(session.draftReply);
    }
  }, [session?.draftReply, isDraftEdited]);

  // Auto-scroll to bottom when new messages arrive
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
      // Refresh this session + parent list
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
      setIsDraftEdited(false);   // let the new server draft overwrite local state
      sessionQuery.refetch();
    },
  });

  // ── Close / discharge session ───────────────────────────────────────────────
  const closeMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/telemed/discharge/${caseId}`, {
        patientName: undefined,  // server will use session.patientInfo if available
      }),
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

  // ── Render ──────────────────────────────────────────────────────────────────

  if (sessionQuery.isLoading) {
    return (
      <div className="space-y-3 animate-pulse p-2">
        {[0.6, 1, 0.75, 0.9, 0.5].map((w, i) => (
          <div key={i} className="h-8 bg-gray-100 rounded" style={{ width: `${w * 100}%` }} />
        ))}
      </div>
    );
  }

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

      {/* ── Red flag banner ── */}
      {session.redFlags?.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-300 rounded p-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Red flags: </span>
            {session.redFlags.join(" · ")}
          </div>
        </div>
      )}

      {/* ── Session status ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs text-gray-500">
            {session.conversation?.length ?? 0} message
            {session.conversation?.length !== 1 ? "s" : ""}
          </span>
          <Badge
            className={`text-[10px] px-1.5 py-0 ${
              isSessionClosed
                ? "bg-gray-400 text-white"
                : "bg-green-600 text-white"
            }`}
          >
            {isSessionClosed ? "Closed" : "Active"}
          </Badge>
        </div>

        {/* Close session */}
        {!isSessionClosed && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => closeMutation.mutate()}
            disabled={closeMutation.isPending}
            className="h-6 text-[10px] border-red-200 text-red-600 hover:bg-red-50"
            data-testid="btn-close-session"
          >
            {closeMutation.isPending
              ? <RefreshCw className="h-3 w-3 animate-spin" />
              : <X className="h-3 w-3 mr-1" />
            }
            Close Session
          </Button>
        )}
      </div>

      {/* ── Conversation thread ── */}
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
                <Badge className="text-[9px] px-1 py-0 bg-purple-100 text-purple-700 ml-1">
                  AI draft
                </Badge>
              )}
            </div>
            <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
          </div>
        ))}
      </div>

      {/* ── Draft reply section ── */}
      {!isSessionClosed && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-xs font-medium text-gray-700">
                AI Draft Reply
              </span>
              {isDraftEdited && (
                <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                  Edited
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1">
              {/* Save draft edits */}
              {isDraftEdited && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => saveDraftMutation.mutate()}
                  disabled={saveDraftMutation.isPending}
                  className="h-6 text-[10px] text-gray-500 hover:text-gray-700"
                  data-testid="btn-save-draft"
                >
                  {saveDraftMutation.isPending
                    ? <RefreshCw className="h-3 w-3 animate-spin" />
                    : "Save draft"
                  }
                </Button>
              )}

              {/* Regenerate */}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending}
                className="h-6 text-[10px] text-purple-600 hover:text-purple-800 hover:bg-purple-50"
                data-testid="btn-regenerate-draft"
                title="Regenerate AI draft"
              >
                {regenerateMutation.isPending
                  ? <RefreshCw className="h-3 w-3 animate-spin" />
                  : <RefreshCw className="h-3 w-3" />
                }
              </Button>
            </div>
          </div>

          {/* Draft textarea */}
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

          {/* Send error */}
          {sendError && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {sendError}
            </div>
          )}

          {/* Approve & Send */}
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={
              !draftText.trim() ||
              sendMutation.isPending ||
              regenerateMutation.isPending
            }
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs h-9"
            data-testid="btn-approve-send"
          >
            {sendMutation.isPending ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                Approve &amp; Send to Patient
              </>
            )}
          </Button>

          <p className="text-[10px] text-gray-400 text-center">
            Physician review required before every send. AI drafts are never auto-sent.
          </p>
        </div>
      )}

      {/* ── Session closed state ── */}
      {isSessionClosed && (
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded p-3">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
          Session closed. No further messages can be sent.
        </div>
      )}

    </div>
  );
}
