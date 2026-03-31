import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Send, CheckCircle2, Radio, FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface VoiceResult {
  transcript: string;
  structured: { symptoms: string[]; raw: string; sttUsed?: boolean; model?: string };
}

type Mode = "text" | "audio";

export default function VoiceIntakePanel() {
  const [patientId, setPatientId] = useState("demo");
  const [text, setText] = useState("Patient reports severe sore throat and fever for 2 days");
  const [mode, setMode] = useState<Mode>("text");
  const [recording, setRecording] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const send = useMutation({
    mutationFn: async () => {
      if (mode === "audio" && audioBlob) {
        const ab = await audioBlob.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
        const r = await apiRequest("POST", "/api/sysctrl/voice", {
          patient_id: patientId,
          audio: base64,
          format: "webm",
        });
        return r.json() as Promise<VoiceResult>;
      } else {
        const r = await apiRequest("POST", "/api/sysctrl/voice", { patient_id: patientId, text });
        return r.json() as Promise<VoiceResult>;
      }
    },
  });

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioReady(true);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      setAudioReady(false);
      setAudioBlob(null);
    } catch {
      alert("Microphone access denied or unavailable.");
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
  }

  return (
    <div className="space-y-3" data-testid="voice-intake-panel">
      {/* Mode toggle */}
      <div className="flex gap-1.5">
        <Button
          size="sm" variant={mode === "text" ? "default" : "outline"} className="h-7 text-xs flex-1"
          onClick={() => setMode("text")} data-testid="mode-text"
        >
          <FileText className="h-3 w-3 mr-1" />Text
        </Button>
        <Button
          size="sm" variant={mode === "audio" ? "default" : "outline"} className="h-7 text-xs flex-1"
          onClick={() => setMode("audio")} data-testid="mode-audio"
        >
          <Mic className="h-3 w-3 mr-1" />Real Audio (STT)
        </Button>
      </div>

      <Input
        value={patientId}
        onChange={e => setPatientId(e.target.value)}
        placeholder="patient_id"
        className="h-7 text-xs"
        data-testid="input-voice-patient-id"
      />

      {mode === "text" ? (
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          placeholder="Voice transcript or patient notes…"
          className="text-xs resize-none"
          data-testid="textarea-voice-text"
        />
      ) : (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-center">
          {!recording && !audioReady && (
            <p className="text-xs text-muted-foreground">Click Record to capture audio. Your browser will transcribe it via OpenAI STT.</p>
          )}
          {recording && (
            <div className="flex items-center justify-center gap-2 text-red-500">
              <Radio className="h-4 w-4 animate-pulse" />
              <span className="text-xs font-medium">Recording…</span>
            </div>
          )}
          {audioReady && !recording && (
            <div className="flex items-center justify-center gap-2 text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs font-medium">Audio captured — ready to submit</span>
            </div>
          )}
          <div className="flex gap-2 justify-center">
            {!recording ? (
              <Button
                size="sm" variant={audioReady ? "outline" : "default"} className="h-7 text-xs"
                onClick={startRecording} data-testid="button-start-recording"
              >
                <Mic className="h-3 w-3 mr-1" />{audioReady ? "Re-record" : "Record"}
              </Button>
            ) : (
              <Button
                size="sm" variant="destructive" className="h-7 text-xs"
                onClick={stopRecording} data-testid="button-stop-recording"
              >
                <MicOff className="h-3 w-3 mr-1" />Stop
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Model: gpt-4o-mini-transcribe (via OpenAI STT)</p>
        </div>
      )}

      <Button
        size="sm"
        className="w-full h-7"
        onClick={() => send.mutate()}
        disabled={send.isPending || (mode === "audio" && !audioReady)}
        data-testid="button-send-voice"
      >
        {send.isPending
          ? <><Mic className="h-3 w-3 mr-1 animate-pulse" />Processing…</>
          : <><Send className="h-3 w-3 mr-1" />Submit Voice Intake</>}
      </Button>

      {send.data && (
        <div className="rounded-lg border bg-card p-3 space-y-2" data-testid="voice-result">
          <div className="flex items-center gap-2 flex-wrap">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            <p className="text-xs font-medium">Processed</p>
            {send.data.structured.sttUsed && (
              <Badge variant="secondary" className="text-xs py-0 gap-1">
                <Mic className="h-2.5 w-2.5" />{send.data.structured.model}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground italic">"{send.data.transcript}"</p>
          {send.data.structured.symptoms.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {send.data.structured.symptoms.map(s => (
                <Badge key={s} variant="secondary" className="text-xs py-0">{s}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
