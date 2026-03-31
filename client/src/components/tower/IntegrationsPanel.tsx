import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Database, Brain, Zap, MessageCircle, FileText, Activity, Phone, CheckCircle2, XCircle, AlertCircle, Clock, ChevronDown, ChevronUp, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Integration { name: string; status: "ok" | "warn" | "error" | "pending"; icon: string; detail?: string; }
interface MessagingStatus {
  telegram: { configured: boolean; status: string; webhook: string };
  twilio_sms: { configured: boolean; status: string; from: string | null };
  twilio_whatsapp: { configured: boolean; status: string; from: string | null };
}
interface FhirStatus {
  configured: boolean;
  baseUrl: string | null;
  status: string;
  smartAuth: boolean;
  supportedResources: string[];
  hint?: string;
}

const ICON_MAP: Record<string, any> = {
  database: Database, brain: Brain, zap: Zap,
  "message-circle": MessageCircle, "file-text": FileText,
  activity: Activity, phone: Phone,
};

const STATUS_ICON: Record<string, any> = {
  ok:      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />,
  warn:    <AlertCircle  className="h-3.5 w-3.5 text-yellow-500 shrink-0" />,
  error:   <XCircle      className="h-3.5 w-3.5 text-red-500 shrink-0" />,
  pending: <Clock        className="h-3.5 w-3.5 text-gray-400 shrink-0" />,
};

const STATUS_BADGE: Record<string, string> = {
  ok:      "bg-green-100 text-green-800 border-green-300",
  warn:    "bg-yellow-100 text-yellow-800 border-yellow-300",
  error:   "bg-red-100 text-red-800 border-red-300",
  pending: "bg-gray-100 text-gray-600 border-gray-300",
};

function msgStatus(s: { configured: boolean; status: string }): "ok" | "warn" {
  return s.configured ? "ok" : "warn";
}

export default function IntegrationsPanel() {
  const { toast } = useToast();
  const [showMsgTest, setShowMsgTest] = useState(false);
  const [msgChannel, setMsgChannel] = useState("sms");
  const [msgTo, setMsgTo] = useState("");
  const [msgText, setMsgText] = useState("Auralyn system test ✓");

  const { data: integrations = [] } = useQuery<Integration[]>({
    queryKey: ["/api/sysctrl/integrations"],
    refetchInterval: 20000,
  });
  const { data: msgStatus_data } = useQuery<MessagingStatus>({
    queryKey: ["/api/sysctrl/messaging-status"],
    refetchInterval: 30000,
  });
  const { data: fhirStatus } = useQuery<FhirStatus>({
    queryKey: ["/api/sysctrl/fhir-status"],
    refetchInterval: 30000,
  });

  const sendTest = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/sysctrl/messaging-test", { channel: msgChannel, to: msgTo, message: msgText })
        .then(r => r.json()),
    onSuccess: (d: any) => {
      if (d.ok) toast({ title: `Message sent via ${msgChannel}`, description: `To: ${msgTo}` });
      else toast({ title: "Send failed", description: d.error, variant: "destructive" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const fhirTestSync = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sysctrl/fhir-test-sync", {}).then(r => r.json()),
    onSuccess: (d: any) => {
      if (d.skipped) toast({ title: "FHIR not configured", description: d.message });
      else if (d.ok) toast({ title: "FHIR sync succeeded", description: `${d.resourcesCreated} resources created` });
      else toast({ title: "FHIR sync failed", description: d.error, variant: "destructive" });
    },
    onError: (e: Error) => toast({ title: "FHIR error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3" data-testid="integrations-panel">
      {/* Core infrastructure */}
      <div className="space-y-1.5">
        {integrations.map((intg, i) => {
          const Icon = ICON_MAP[intg.icon] ?? Activity;
          return (
            <div key={i} className="flex items-center justify-between p-2 rounded-lg border bg-card text-xs" data-testid={`integration-row-${i}`}>
              <div className="flex items-center gap-2">
                {STATUS_ICON[intg.status] ?? STATUS_ICON.pending}
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-medium">{intg.name}</span>
                {intg.detail && <span className="text-muted-foreground">{intg.detail}</span>}
              </div>
              <Badge className={`text-xs py-0 border ${STATUS_BADGE[intg.status]}`}>
                {intg.status}
              </Badge>
            </div>
          );
        })}
      </div>

      {/* Messaging section */}
      {msgStatus_data && (
        <div className="rounded-lg border bg-card p-3 space-y-2" data-testid="messaging-status">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Messaging Channels</p>
            <Button
              size="sm" variant="ghost" className="h-5 px-1 text-xs gap-0.5"
              onClick={() => setShowMsgTest(v => !v)}
              data-testid="toggle-msg-test"
            >
              {showMsgTest ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Test
            </Button>
          </div>

          <div className="space-y-1">
            {[
              { label: "Telegram", data: msgStatus_data.telegram, detail: msgStatus_data.telegram.webhook },
              { label: "Twilio SMS", data: msgStatus_data.twilio_sms, detail: msgStatus_data.twilio_sms.from ? `from ${msgStatus_data.twilio_sms.from}` : undefined },
              { label: "Twilio WhatsApp", data: msgStatus_data.twilio_whatsapp, detail: msgStatus_data.twilio_whatsapp.from ? `from ${msgStatus_data.twilio_whatsapp.from}` : undefined },
            ].map(ch => (
              <div key={ch.label} className="flex items-center justify-between text-xs" data-testid={`msg-channel-${ch.label.toLowerCase().replace(/\s/g, "-")}`}>
                <div className="flex items-center gap-1.5">
                  {STATUS_ICON[msgStatus(ch.data)]}
                  <span className="font-medium">{ch.label}</span>
                  {ch.detail && <span className="text-muted-foreground truncate max-w-28">{ch.detail}</span>}
                </div>
                <Badge className={`text-xs py-0 border ${STATUS_BADGE[msgStatus(ch.data)]}`}>
                  {ch.data.status}
                </Badge>
              </div>
            ))}
          </div>

          {showMsgTest && (
            <div className="pt-2 space-y-1.5 border-t">
              <p className="text-xs font-medium">Send Test Message</p>
              <div className="grid grid-cols-3 gap-1">
                {["sms", "whatsapp", "telegram"].map(c => (
                  <Button
                    key={c} size="sm" variant={msgChannel === c ? "default" : "outline"}
                    className="h-6 text-xs py-0" onClick={() => setMsgChannel(c)}
                    data-testid={`select-channel-${c}`}
                  >{c}</Button>
                ))}
              </div>
              <Input value={msgTo} onChange={e => setMsgTo(e.target.value)} placeholder={msgChannel === "telegram" ? "chat_id" : "+1234567890"} className="h-7 text-xs" data-testid="input-msg-to" />
              <Input value={msgText} onChange={e => setMsgText(e.target.value)} className="h-7 text-xs" data-testid="input-msg-text" />
              <Button size="sm" className="w-full h-7 text-xs" onClick={() => sendTest.mutate()} disabled={sendTest.isPending || !msgTo} data-testid="button-send-msg-test">
                <Send className="h-3 w-3 mr-1" />{sendTest.isPending ? "Sending…" : "Send Test"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* FHIR section */}
      {fhirStatus && (
        <div className="rounded-lg border bg-card p-3 space-y-2" data-testid="fhir-status">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">FHIR R4 Bridge</p>
            <Badge className={`text-xs py-0 border ${STATUS_BADGE[fhirStatus.configured ? "ok" : "warn"]}`}>
              {fhirStatus.status}
            </Badge>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-1.5">
              {STATUS_ICON[fhirStatus.configured ? "ok" : "warn"]}
              <span>{fhirStatus.configured ? fhirStatus.baseUrl : "FHIR_BASE_URL not set"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {STATUS_ICON[fhirStatus.smartAuth ? "ok" : "pending"]}
              <span>SMART auth: {fhirStatus.smartAuth ? "configured" : "not configured"}</span>
            </div>
            <div className="flex flex-wrap gap-1 pt-0.5">
              {fhirStatus.supportedResources.map(r => (
                <Badge key={r} variant="secondary" className="text-xs py-0">{r}</Badge>
              ))}
            </div>
            {fhirStatus.hint && <p className="text-muted-foreground italic">{fhirStatus.hint}</p>}
          </div>
          <Button
            size="sm" variant="outline" className="w-full h-7 text-xs"
            onClick={() => fhirTestSync.mutate()} disabled={fhirTestSync.isPending}
            data-testid="button-fhir-test-sync"
          >
            {fhirTestSync.isPending ? "Syncing…" : "Run Test Sync"}
          </Button>
        </div>
      )}
    </div>
  );
}
