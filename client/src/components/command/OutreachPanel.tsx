import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import {
  Activity,
  AlertCircle,
  CheckCircle,
  MessageSquare,
  MessageCircle,
  Phone,
  Clock,
  Heart,
  Thermometer,
  TrendingUp,
} from "lucide-react";
import type { PatientRow } from "./MultiPatientGrid";
import { cn } from "@/lib/utils";

interface OutreachLogEntry {
  id: string;
  patient_id: string;
  channel: string;
  message: string;
  status: string;
  created_at: string;
}

interface AdmissionRule {
  feature_key: string;
  label: string;
  weight: number;
  category: string;
}

function riskLevel(score: number) {
  if (score >= 0.8) return "critical";
  if (score >= 0.6) return "high";
  if (score >= 0.35) return "moderate";
  return "low";
}

const LEVEL_COLORS: Record<string, string> = {
  critical: "text-red-500 bg-red-500/10 border-red-500/30",
  high:     "text-orange-500 bg-orange-500/10 border-orange-500/30",
  moderate: "text-yellow-500 bg-yellow-500/10 border-yellow-500/30",
  low:      "text-green-500 bg-green-500/10 border-green-500/30",
};

function defaultMessage(patient: PatientRow, channel: "sms" | "whatsapp" | "voice") {
  const prefix = channel === "voice" ? "" : `Hi ${patient.name?.split(" ")[0] ?? ""},\n\n`;
  if (patient.risk_score >= 0.8)
    return `${prefix}This is an urgent message from Auralyn Medical. Based on your recent assessment, we strongly recommend you seek immediate emergency care. Please call 911 or go to your nearest ER now.`;
  if (patient.risk_score >= 0.6)
    return `${prefix}Our clinical team has reviewed your assessment. We recommend you visit an urgent care center today. Please reply CONFIRM to acknowledge or call us.`;
  return `${prefix}Your Auralyn triage results are ready. Our team recommends a follow-up visit. Reply YES to confirm your next appointment.`;
}

interface Props {
  patient: PatientRow;
}

export default function OutreachPanel({ patient }: Props) {
  const { toast } = useToast();
  const [smsMsg, setSmsMsg]     = useState(() => defaultMessage(patient, "sms"));
  const [waMsg, setWaMsg]       = useState(() => defaultMessage(patient, "whatsapp"));
  const [voiceMsg, setVoiceMsg] = useState(() => defaultMessage(patient, "voice"));

  const level = riskLevel(patient.risk_score);

  const { data: logData } = useQuery<{ log: OutreachLogEntry[] }>({
    queryKey: ["/api/command/outreach-log", patient.patient_id],
    queryFn: () =>
      apiRequest("GET", `/api/command/outreach-log?patientId=${patient.patient_id}`).then(r => r.json()),
    refetchInterval: 10_000,
  });

  const { data: riskRulesData } = useQuery<{ rules: AdmissionRule[] }>({
    queryKey: ["/api/command/admission-risk"],
    refetchOnMount: false,
  });

  const outreachMut = useMutation({
    mutationFn: async (payload: { channel: "sms" | "whatsapp"; message: string }) =>
      (await apiRequest("POST", "/api/command/outreach", {
        patientId: patient.patient_id,
        to: patient.phone,
        ...payload,
      })).json(),
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/command/outreach-log", patient.patient_id] });
      if (data.ok) {
        toast({ title: `${vars.channel === "sms" ? "SMS" : "WhatsApp"} sent`, description: `Delivered to ${patient.phone}` });
      } else {
        toast({ title: "Send failed", description: data.error ?? "Unknown error", variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const voiceMut = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", "/api/command/voice-call", {
        patientId: patient.patient_id,
        to: patient.phone,
        message: voiceMsg,
      })).json(),
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ["/api/command/outreach-log", patient.patient_id] });
      if (data.ok) {
        toast({ title: "Voice call initiated", description: `Call SID: ${data.callSid}` });
      } else {
        toast({ title: "Call failed", description: data.error ?? "Unknown error", variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const topContributors = (riskRulesData?.rules ?? [])
    .filter(r => patient.flags?.includes(r.feature_key))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-5">

        {/* Patient header */}
        <div className={cn("rounded-lg border p-3", LEVEL_COLORS[level])}>
          <div className="flex items-start justify-between">
            <div>
              <div className="font-bold text-base" data-testid="text-patient-name">{patient.name}</div>
              <div className="text-sm opacity-80">Age {patient.age} · {patient.phone}</div>
              <div className="text-sm mt-1 italic opacity-70">"{patient.chief_complaint}"</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black" data-testid="text-risk-score">
                {Math.round(patient.risk_score * 100)}%
              </div>
              <div className="text-xs font-semibold uppercase">{level} risk</div>
            </div>
          </div>
        </div>

        {/* Vitals + admission risk */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded border p-2 bg-muted/30 space-y-1">
            <div className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Vitals</div>
            {patient.vitals?.hr  && <div className="flex gap-2 text-xs items-center"><Heart size={11} /> HR {patient.vitals.hr} bpm</div>}
            {patient.vitals?.spo2 && <div className={cn("flex gap-2 text-xs items-center", patient.vitals.spo2 < 93 && "text-red-400")}><Activity size={11} /> SpO₂ {patient.vitals.spo2}%</div>}
            {patient.vitals?.sbp  && <div className={cn("flex gap-2 text-xs items-center", patient.vitals.sbp < 90 && "text-red-400")}><TrendingUp size={11} /> SBP {patient.vitals.sbp}</div>}
            {patient.vitals?.temp && <div className={cn("flex gap-2 text-xs items-center", patient.vitals.temp >= 39 && "text-orange-400")}><Thermometer size={11} /> {patient.vitals.temp}°C</div>}
          </div>
          <div className="rounded border p-2 bg-muted/30">
            <div className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Adm. Risk Score</div>
            <div className="text-2xl font-black text-primary" data-testid="text-admission-risk">
              {Math.round(patient.admission_risk * 100)}%
            </div>
            <div className="text-xs text-muted-foreground">Admission probability</div>
            {topContributors.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {topContributors.map(r => (
                  <div key={r.feature_key} className="flex items-center gap-1 text-[11px]">
                    <span className="text-orange-400">▲</span>
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="ml-auto text-orange-400 font-semibold">+{Math.round(r.weight * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* SMS */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-blue-400" />
            <span className="font-semibold text-sm">SMS Outreach</span>
          </div>
          <Textarea
            data-testid="input-sms-message"
            value={smsMsg}
            onChange={e => setSmsMsg(e.target.value)}
            rows={3}
            className="text-xs resize-none"
          />
          <Button
            size="sm"
            className="w-full"
            disabled={outreachMut.isPending}
            onClick={() => outreachMut.mutate({ channel: "sms", message: smsMsg })}
            data-testid="button-send-sms"
          >
            <MessageSquare size={13} className="mr-1.5" />
            Send SMS to {patient.phone}
          </Button>
        </div>

        {/* WhatsApp */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <MessageCircle size={14} className="text-green-400" />
            <span className="font-semibold text-sm">WhatsApp Outreach</span>
          </div>
          <Textarea
            data-testid="input-whatsapp-message"
            value={waMsg}
            onChange={e => setWaMsg(e.target.value)}
            rows={3}
            className="text-xs resize-none"
          />
          <Button
            size="sm"
            variant="outline"
            className="w-full border-green-500/40 hover:bg-green-500/10 text-green-400"
            disabled={outreachMut.isPending}
            onClick={() => outreachMut.mutate({ channel: "whatsapp", message: waMsg })}
            data-testid="button-send-whatsapp"
          >
            <MessageCircle size={13} className="mr-1.5" />
            Send via WhatsApp
          </Button>
        </div>

        {/* Voice */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Phone size={14} className="text-purple-400" />
            <span className="font-semibold text-sm">Voice Call (TTS)</span>
          </div>
          <Textarea
            data-testid="input-voice-message"
            value={voiceMsg}
            onChange={e => setVoiceMsg(e.target.value)}
            rows={3}
            className="text-xs resize-none"
          />
          <Button
            size="sm"
            variant="outline"
            className="w-full border-purple-500/40 hover:bg-purple-500/10 text-purple-400"
            disabled={voiceMut.isPending}
            onClick={() => voiceMut.mutate()}
            data-testid="button-initiate-voice"
          >
            <Phone size={13} className="mr-1.5" />
            Initiate Voice Call
          </Button>
        </div>

        <Separator />

        {/* Outreach history */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock size={13} className="text-muted-foreground" />
            <span className="text-sm font-semibold">Outreach History</span>
          </div>
          {(logData?.log ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground py-3 text-center">No outreach sent yet</div>
          ) : (
            <div className="space-y-1.5" data-testid="outreach-log">
              {(logData?.log ?? []).map(entry => (
                <div key={entry.id} className="rounded border p-2 bg-muted/20 text-xs">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5">
                      {entry.channel === "sms"      && <MessageSquare size={10} className="text-blue-400" />}
                      {entry.channel === "whatsapp" && <MessageCircle size={10} className="text-green-400" />}
                      {entry.channel === "voice"    && <Phone size={10} className="text-purple-400" />}
                      <span className="uppercase font-semibold text-[10px]">{entry.channel}</span>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("text-[9px] h-3.5", entry.status === "sent" || entry.status === "initiated" ? "text-green-400" : "text-red-400")}
                    >
                      {entry.status === "sent" || entry.status === "initiated"
                        ? <><CheckCircle size={9} className="mr-0.5" />{entry.status}</>
                        : <><AlertCircle size={9} className="mr-0.5" />{entry.status}</>}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground line-clamp-2">{entry.message}</div>
                  <div className="text-muted-foreground/60 mt-0.5">{new Date(entry.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
