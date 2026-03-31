import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Mic, Send, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface VoiceResult {
  transcript: string;
  structured: { symptoms: string[]; raw: string };
}

export default function VoiceIntakePanel() {
  const [patientId, setPatientId] = useState("demo");
  const [text, setText] = useState("Patient reports severe sore throat and fever for 2 days");

  const send = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/sysctrl/voice", { patient_id: patientId, text });
      return r.json() as Promise<VoiceResult>;
    },
  });

  return (
    <div className="space-y-3" data-testid="voice-intake-panel">
      <div className="flex gap-2">
        <Input
          value={patientId}
          onChange={e => setPatientId(e.target.value)}
          placeholder="patient_id"
          className="h-7 text-xs w-24 shrink-0"
          data-testid="input-voice-patient-id"
        />
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          placeholder="Voice transcript or patient notes…"
          className="text-xs resize-none flex-1"
          data-testid="textarea-voice-text"
        />
      </div>
      <Button
        size="sm"
        className="w-full h-7"
        onClick={() => send.mutate()}
        disabled={send.isPending}
        data-testid="button-send-voice"
      >
        {send.isPending
          ? <><Mic className="h-3 w-3 mr-1 animate-pulse" />Processing…</>
          : <><Send className="h-3 w-3 mr-1" />Submit Voice Intake</>}
      </Button>
      {send.data && (
        <div className="rounded-lg border bg-card p-3 space-y-2" data-testid="voice-result">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            <p className="text-xs font-medium">Processed</p>
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
