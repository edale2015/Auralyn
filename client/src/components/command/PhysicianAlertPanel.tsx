import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Clock,
  Phone,
  Stethoscope,
  User,
  XCircle,
  Zap,
} from "lucide-react";
import type { PatientRow } from "./MultiPatientGrid";
import { cn } from "@/lib/utils";

interface PhysicianAlert {
  id: string;
  patient_id: string;
  physician_name: string;
  physician_phone: string;
  message: string;
  status: string;
  created_at: string;
}

interface Props {
  patient: PatientRow;
}

const QUICK_MESSAGES = [
  "URGENT: Patient requires immediate evaluation. High clinical risk score detected.",
  "STAT page: Patient vitals deteriorating. Please respond within 5 minutes.",
  "Patient admitted to ER. Your assessment needed urgently.",
  "Alert: Sepsis criteria met. Please review and initiate protocol.",
  "Patient disposition requires physician override. Please review case.",
];

function urgencyForRisk(riskScore: number): string {
  if (riskScore >= 0.8) return "CRITICAL ALERT";
  if (riskScore >= 0.6) return "URGENT";
  return "NOTICE";
}

export default function PhysicianAlertPanel({ patient }: Props) {
  const { toast } = useToast();
  const [physicianName, setPhysicianName]   = useState("Dr. Smith");
  const [physicianPhone, setPhysicianPhone] = useState("+15551234567");
  const [message, setMessage] = useState(
    `${urgencyForRisk(patient.risk_score)}: Patient ${patient.name} (Age ${patient.age}) — ${patient.chief_complaint}. Risk: ${Math.round(patient.risk_score * 100)}%. Admission probability: ${Math.round((patient.admission_risk ?? 0) * 100)}%. Immediate evaluation requested.`
  );

  const { data: logData } = useQuery<{ alerts: PhysicianAlert[] }>({
    queryKey: ["/api/command/physician-alerts", patient.patient_id],
    queryFn: () =>
      apiRequest("GET", `/api/command/physician-alerts?patientId=${patient.patient_id}`).then(r => r.json()),
    refetchInterval: 15_000,
  });

  const alertMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/command/physician-alert", {
        patientId: patient.patient_id,
        physicianName,
        physicianPhone,
        message,
      }).then(r => r.json()),
    onSuccess: d => {
      queryClient.invalidateQueries({ queryKey: ["/api/command/physician-alerts", patient.patient_id] });
      if (d.ok) {
        toast({ title: "Physician Paged", description: `SMS alert sent to ${physicianName} at ${physicianPhone}` });
      } else {
        toast({ title: "Page failed", description: d.error ?? "Unknown error", variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">

        {/* Header */}
        <div className="flex items-center gap-2">
          <Bell size={14} className="text-orange-400" />
          <span className="text-sm font-semibold">Physician Auto-Paging</span>
          <Badge variant="outline" className="ml-auto text-[10px] text-orange-400 border-orange-500/30">
            SMS Alert
          </Badge>
        </div>

        {/* Patient urgency banner */}
        <div className={cn(
          "rounded-lg border p-2.5 text-xs",
          patient.risk_score >= 0.8
            ? "border-red-500/30 bg-red-500/10 text-red-400"
            : patient.risk_score >= 0.6
            ? "border-orange-500/30 bg-orange-500/10 text-orange-400"
            : "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
        )}>
          <div className="flex items-center gap-1.5 font-semibold mb-0.5">
            <AlertTriangle size={11} />
            {urgencyForRisk(patient.risk_score)} — {patient.name}
          </div>
          <div>{patient.chief_complaint}</div>
          <div className="mt-0.5">Risk: {Math.round(patient.risk_score * 100)}% · Adm. Risk: {Math.round((patient.admission_risk ?? 0) * 100)}%</div>
        </div>

        {/* Physician fields */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Stethoscope size={12} className="text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">Physician on Call</span>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <User size={12} className="absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                data-testid="input-physician-name"
                value={physicianName}
                onChange={e => setPhysicianName(e.target.value)}
                className="pl-7 h-8 text-xs"
                placeholder="Physician name"
              />
            </div>
            <div className="relative flex-1">
              <Phone size={12} className="absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                data-testid="input-physician-phone"
                value={physicianPhone}
                onChange={e => setPhysicianPhone(e.target.value)}
                className="pl-7 h-8 text-xs"
                placeholder="+1xxxxxxxxxx"
              />
            </div>
          </div>
        </div>

        {/* Quick message templates */}
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-muted-foreground">Quick Templates</div>
          <div className="space-y-1">
            {QUICK_MESSAGES.slice(0, 3).map((msg, i) => (
              <button
                key={i}
                className="w-full text-left text-[11px] text-muted-foreground rounded border px-2 py-1.5 hover:bg-muted/40 truncate"
                onClick={() => setMessage(msg)}
                data-testid={`template-${i}`}
              >
                {msg.slice(0, 70)}…
              </button>
            ))}
          </div>
        </div>

        {/* Alert message */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">Alert Message</div>
          <Textarea
            data-testid="input-physician-message"
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={4}
            className="text-xs resize-none"
          />
        </div>

        {/* Page button */}
        <Button
          className="w-full bg-orange-600 hover:bg-orange-700 text-white"
          disabled={alertMut.isPending || !physicianPhone}
          onClick={() => alertMut.mutate()}
          data-testid="button-page-physician"
        >
          <Zap size={13} className="mr-1.5" />
          {alertMut.isPending ? "Paging…" : "Page Physician via SMS"}
        </Button>

        <Separator />

        {/* Alert history */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock size={12} className="text-muted-foreground" />
            <span className="text-xs font-semibold">Alert History</span>
          </div>
          {(logData?.alerts ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-3">No alerts sent yet</div>
          ) : (
            <div className="space-y-1.5" data-testid="alert-log">
              {(logData?.alerts ?? []).map(a => (
                <div key={a.id} className="rounded border p-2 bg-muted/20 text-xs">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-semibold">{a.physician_name}</span>
                    <Badge variant="outline" className={cn("text-[9px] h-3.5", a.status === "sent" ? "text-green-400" : a.status === "sending" ? "text-yellow-400" : "text-red-400")}>
                      {a.status === "sent" ? <CheckCircle size={9} className="mr-0.5" /> : <XCircle size={9} className="mr-0.5" />}
                      {a.status}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground line-clamp-1">{a.message}</div>
                  <div className="text-muted-foreground/60 mt-0.5">{new Date(a.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
