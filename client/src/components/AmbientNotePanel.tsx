/**
 * AmbientNotePanel.tsx
 *
 * Provides ambient voice transcription during physician case review.
 *
 * HOW IT WORKS:
 *   1. Physician clicks the Mic button — Web Speech API starts listening in browser
 *   2. Each recognized phrase is forwarded to /ws/multimodal as { type:"audio", audioTranscript, ... }
 *   3. Socket returns { type:"result", result } — result.rawText appended to notes textarea
 *   4. "Stamp SOAP Note" button calls POST /api/review/case/:caseId/soap and injects
 *      the generated ChartNote.rawText into the notes textarea via onStamp callback
 *
 * TRANSCRIPTION: Web Speech API (browser-native, no cost, no round-trip).
 *   No raw audio bytes are ever sent — only pre-transcribed text strings.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Mic, MicOff, FileSignature, RefreshCw, AlertTriangle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AmbientNotePanelProps {
  caseId: string | number;
  complaint?: string;
  onTranscript: (text: string) => void;
  onStamp: (soapText: string) => void;
}

interface SoapApiResponse {
  ok: boolean;
  note: {
    chiefComplaint: string;
    hpi: string;
    assessment: string;
    plan: string;
    disposition: string;
    safetyNetting: string;
    rawText: string;
  };
  error?: string;
}

// Web Speech API types (not in default TS lib)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
declare class SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
declare const webkitSpeechRecognition: typeof SpeechRecognition;

// ─── WebSocket singleton ──────────────────────────────────────────────────────

function buildWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws/multimodal`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AmbientNotePanel({
  caseId,
  complaint,
  onTranscript,
  onStamp,
}: AmbientNotePanelProps) {
  const [isListening,   setIsListening]   = useState(false);
  const [isConnected,   setIsConnected]   = useState(false);
  const [transcriptLog, setTranscriptLog] = useState<string[]>([]);
  const [wsError,       setWsError]       = useState<string | null>(null);
  const [speechError,   setSpeechError]   = useState<string | null>(null);
  const [isStamped,     setIsStamped]     = useState(false);

  const wsRef          = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const sessionId      = useRef(`case-${caseId}-${Date.now()}`);

  // ── Browser support check ───────────────────────────────────────────────────
  const speechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // ── WebSocket setup ─────────────────────────────────────────────────────────
  const connectSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setWsError(null);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.type === "result" && msg.result?.rawText) {
          onTranscript(msg.result.rawText);
          setTranscriptLog(prev => [...prev, msg.result.rawText]);
        }

        if (msg.type === "escalation" && msg.redFlags?.length) {
          setWsError(`⚠ Escalation flagged: ${msg.nextStep}`);
        }

        if (msg.type === "error") {
          setWsError(msg.error ?? "Socket error");
        }
      } catch {
        // Non-JSON message — ignore
      }
    };

    ws.onerror = () => {
      setWsError("WebSocket connection failed — transcription relay unavailable");
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };
  }, [onTranscript]);

  // ── Speech recognition setup ────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!speechSupported) {
      setSpeechError("Speech recognition not supported in this browser. Use Chrome.");
      return;
    }

    connectSocket();

    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    const recognition: SpeechRecognition = new SR();
    recognition.continuous     = true;
    recognition.interimResults = false;
    recognition.lang           = "en-US";
    recognitionRef.current     = recognition;

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const phrase = e.results[i][0].transcript.trim();
          if (!phrase) continue;

          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type:            "audio",
              sessionId:       sessionId.current,
              patientId:       `patient-${caseId}`,
              audioTranscript: phrase,
              complaint:       complaint ?? "",
            }));
          }

          // Surface immediately in notes before socket round-trip
          onTranscript(phrase);
          setTranscriptLog(prev => [...prev, phrase]);
        }
      }
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "not-allowed") {
        setSpeechError("Microphone access denied. Allow mic in browser settings.");
      } else if (e.error !== "no-speech") {
        setSpeechError(`Speech error: ${e.error}`);
      }
    };

    recognition.onend = () => {
      if (isListening && recognitionRef.current === recognition) {
        try { recognition.start(); } catch { /* already started */ }
      }
    };

    setSpeechError(null);
    setIsListening(true);
    recognition.start();
  }, [speechSupported, connectSocket, caseId, complaint, onTranscript, isListening]);

  const stopListening = useCallback(() => {
    setIsListening(false);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const toggleMic = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // ── SOAP stamp mutation ─────────────────────────────────────────────────────
  const soapMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest<SoapApiResponse>(
        "POST",
        `/api/review/case/${caseId}/soap`,
        { caseId: String(caseId), complaint }
      );
      return res;
    },
    onSuccess: (data) => {
      if (data.ok && data.note?.rawText) {
        onStamp(data.note.rawText);
        setIsStamped(true);
        setTimeout(() => setIsStamped(false), 3000);
      }
    },
  });

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      wsRef.current?.close();
    };
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Card className="border border-gray-200 bg-gray-50/40">
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold text-gray-800">
              Ambient Note Capture
            </CardTitle>

            {isListening && (
              <Badge
                className={`text-[10px] px-1.5 py-0 ${
                  isConnected
                    ? "bg-green-600 text-white"
                    : "bg-yellow-500 text-white"
                }`}
              >
                {isConnected ? "● Live" : "● Connecting…"}
              </Badge>
            )}

            {transcriptLog.length > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {transcriptLog.length} phrase{transcriptLog.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* SOAP stamp button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => soapMutation.mutate()}
                    disabled={soapMutation.isPending || isStamped}
                    className="h-7 text-xs border-gray-300 text-gray-700 hover:bg-gray-100"
                    data-testid="btn-stamp-soap"
                  >
                    {soapMutation.isPending ? (
                      <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <FileSignature className="h-3 w-3 mr-1" />
                    )}
                    {isStamped ? "Stamped ✓" : "Stamp SOAP Note"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Generate full SOAP note from case data and insert into notes
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Mic toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    onClick={toggleMic}
                    disabled={!speechSupported}
                    className={`h-8 w-8 p-0 rounded-full transition-colors ${
                      isListening
                        ? "bg-red-600 hover:bg-red-700 text-white animate-pulse"
                        : "bg-gray-800 hover:bg-gray-700 text-white"
                    }`}
                    data-testid="btn-mic-toggle"
                    aria-label={isListening ? "Stop recording" : "Start recording"}
                  >
                    {isListening
                      ? <MicOff className="h-3.5 w-3.5" />
                      : <Mic    className="h-3.5 w-3.5" />
                    }
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {!speechSupported
                    ? "Speech recognition requires Chrome"
                    : isListening
                    ? "Stop recording (speech appends to notes below)"
                    : "Start ambient recording"
                  }
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 pb-3 space-y-2">

        {!speechSupported && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Speech recognition requires Chrome. Open this page in Chrome to use ambient recording.
          </div>
        )}

        {speechError && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {speechError}
          </div>
        )}

        {wsError && (
          <div className="flex items-center gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded p-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {wsError}
          </div>
        )}

        {soapMutation.isError && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            SOAP generation failed — check /api/review/case/:id/soap is registered.{" "}
            <button
              onClick={() => soapMutation.mutate()}
              className="underline font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {!isListening && !transcriptLog.length && speechSupported && (
          <p className="text-xs text-gray-400 text-center py-1">
            Press the mic button to start capturing speech into notes.
            Use "Stamp SOAP Note" to auto-generate a structured note from the case data.
          </p>
        )}

        {transcriptLog.length > 0 && (
          <div className="bg-white border border-gray-200 rounded p-2 max-h-28 overflow-y-auto">
            <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">
              Captured phrases
            </p>
            {transcriptLog.map((phrase, i) => (
              <p key={i} className="text-xs text-gray-600 leading-relaxed">
                {phrase}
              </p>
            ))}
          </div>
        )}

        {isListening && (
          <p className="text-xs text-center text-red-600 font-medium">
            ● Recording — speak naturally. Phrases append to notes below automatically.
          </p>
        )}

      </CardContent>
    </Card>
  );
}
