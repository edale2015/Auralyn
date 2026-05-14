import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import {
  CheckCircle2, Clock, AlertTriangle, Home, Phone,
  ChevronRight, Stethoscope, Heart, Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientSummary {
  disposition:      string;
  dispositionColor: string;
  oneLiner:         string;
  urgencySignal:    string;
  summary:          Record<string, any>;
  generatedAt:      string;
}

interface DiagramOutput {
  available:       boolean;
  diagramType:     string;
  svgContent:      string;
  patientCaption:  string;
  keyMessage:      string;
  uncertaintyNote: string | null;
}

// ─── Disposition UI config ────────────────────────────────────────────────────

function getDispositionConfig(disposition: string, color: string) {
  const map: Record<string, any> = {
    ER_IMMEDIATE:        { label: "Go to ER Now",              icon: AlertTriangle, bg: "bg-red-50 dark:bg-red-950/40",      border: "border-red-300 dark:border-red-700",       text: "text-red-700 dark:text-red-300",      action: "Call 911 or have someone drive you to the emergency room immediately." },
    ER_URGENT:           { label: "Go to ER Today",            icon: AlertTriangle, bg: "bg-orange-50 dark:bg-orange-950/40", border: "border-orange-300 dark:border-orange-700", text: "text-orange-700 dark:text-orange-300", action: "Please go to the nearest emergency room within the next hour." },
    URGENT_CARE_TODAY:   { label: "Urgent Care Today",         icon: Clock,         bg: "bg-amber-50 dark:bg-amber-950/40",   border: "border-amber-300 dark:border-amber-700",   text: "text-amber-700 dark:text-amber-300",   action: "Please visit an urgent care center today." },
    URGENT_CARE_24H:     { label: "Urgent Care — 24 Hours",    icon: Clock,         bg: "bg-amber-50 dark:bg-amber-950/40",   border: "border-amber-300 dark:border-amber-700",   text: "text-amber-700 dark:text-amber-300",   action: "Please visit an urgent care center within 24 hours." },
    PRIMARY_CARE_48H:    { label: "See Your Doctor — 48 Hours",icon: Stethoscope,   bg: "bg-blue-50 dark:bg-blue-950/40",     border: "border-blue-300 dark:border-blue-700",     text: "text-blue-700 dark:text-blue-300",     action: "Please schedule an appointment with your primary care doctor within 2 days." },
    PRIMARY_CARE_ROUTINE:{ label: "See Your Doctor",           icon: Stethoscope,   bg: "bg-blue-50 dark:bg-blue-950/40",     border: "border-blue-300 dark:border-blue-700",     text: "text-blue-700 dark:text-blue-300",     action: "Please schedule a routine appointment with your primary care doctor." },
    TELEHEALTH:          { label: "Telehealth Visit",          icon: Phone,         bg: "bg-teal-50 dark:bg-teal-950/40",     border: "border-teal-300 dark:border-teal-700",     text: "text-teal-700 dark:text-teal-300",     action: "You can be seen via a video/phone visit. We'll connect you shortly." },
    HOME_CARE:           { label: "Rest at Home",              icon: Home,          bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-300 dark:border-emerald-700", text: "text-emerald-700 dark:text-emerald-300", action: "Your symptoms can be managed at home. Follow the instructions below." },
  };
  return map[disposition] ?? { label: "Care Plan Ready", icon: Heart, bg: "bg-muted", border: "border-border", text: "text-foreground", action: "Your care team has reviewed your information." };
}

// ─── Next Steps ───────────────────────────────────────────────────────────────

function getNextSteps(disposition: string): string[] {
  const steps: Record<string, string[]> = {
    HOME_CARE:            ["Rest and stay hydrated", "Take OTC medications as directed", "Monitor your symptoms", "Return if symptoms worsen or you develop fever, difficulty breathing, or chest pain"],
    TELEHEALTH:           ["A telehealth provider will contact you within 1 hour", "Have your insurance card ready", "Be in a quiet, private space for the call"],
    PRIMARY_CARE_48H:     ["Call your doctor's office to schedule today", "Keep track of your symptoms until then", "Go to urgent care or ER if symptoms worsen significantly"],
    PRIMARY_CARE_ROUTINE: ["Schedule with your doctor at your convenience", "Bring this summary to your appointment", "Track any changes in symptoms"],
    URGENT_CARE_TODAY:    ["Go to urgent care as soon as possible", "Bring your insurance card and ID", "Do not drive if you feel unsafe — ask someone to take you"],
    ER_URGENT:            ["Go to the emergency room now", "If you have no transportation, call 911", "Do not eat or drink until evaluated"],
    ER_IMMEDIATE:         ["CALL 911 NOW", "Do not drive yourself", "Unlock your front door if waiting for ambulance"],
  };
  return steps[disposition] ?? ["Follow your care team's instructions", "Contact us if you have questions"];
}

// ─── Emergency signs ──────────────────────────────────────────────────────────

const EMERGENCY_SIGNS = [
  "Chest pain or pressure",
  "Severe difficulty breathing",
  "Sudden confusion or unresponsiveness",
  "Signs of stroke (face drooping, arm weakness, speech problems)",
  "Severe bleeding that won't stop",
  "High fever with stiff neck",
];

// ─── Anatomical Diagram Card ──────────────────────────────────────────────────

function DiagramCard({ shareToken }: { shareToken: string }) {
  const { data, isLoading } = useQuery<{ ok: boolean; diagram: DiagramOutput }>({
    queryKey: ["/api/dialogue/patient-summary", shareToken, "diagram"],
    queryFn: async () => {
      const res = await fetch(`/api/dialogue/patient-summary/${shareToken}/diagram`);
      if (!res.ok) throw new Error("Diagram unavailable");
      return res.json();
    },
    enabled: !!shareToken,
    retry: false,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-diagram-loading">
        <CardContent className="pt-5">
          <div className="flex items-center gap-3 animate-pulse">
            <div className="w-24 h-24 rounded bg-muted flex-shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-3 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const diagram = data?.diagram;
  if (!diagram?.available || !diagram?.svgContent) return null;

  return (
    <Card data-testid="card-diagram">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          Where Your Symptoms Are Coming From
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div
            className="w-40 h-40 flex-shrink-0 mx-auto sm:mx-0"
            data-testid="svg-diagram"
            dangerouslySetInnerHTML={{ __html: diagram.svgContent }}
          />
          <div className="space-y-2 flex-1">
            {diagram.keyMessage && (
              <p className="text-sm font-medium text-foreground" data-testid="text-diagram-key-message">
                {diagram.keyMessage}
              </p>
            )}
            <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-diagram-caption">
              {diagram.patientCaption}
            </p>
            {diagram.uncertaintyNote && (
              <div className="flex items-start gap-2 p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300" data-testid="text-diagram-uncertainty">
                  {diagram.uncertaintyNote}
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function PatientLivingEncounter() {
  const params     = useParams<{ shareToken: string }>();
  const shareToken = params.shareToken;

  const { data, isLoading, isError } = useQuery<{ ok: boolean; summary: PatientSummary }>({
    queryKey: ["/api/dialogue/patient-summary", shareToken],
    queryFn: async () => {
      const res = await fetch(`/api/dialogue/patient-summary/${shareToken}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled:        !!shareToken,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" data-testid="status-loading">
        <div className="text-center space-y-3">
          <Heart className="w-10 h-10 mx-auto text-rose-400 animate-pulse" />
          <p className="text-muted-foreground">Loading your care summary…</p>
        </div>
      </div>
    );
  }

  if (isError || !data?.summary) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" data-testid="status-error">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 mx-auto text-amber-400" />
            <h2 className="text-lg font-semibold">Summary Not Available</h2>
            <p className="text-sm text-muted-foreground">
              This link may have expired or is invalid. Please contact your care team.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { summary }  = data;
  const config       = getDispositionConfig(summary.disposition, summary.dispositionColor);
  const ConfigIcon   = config.icon;
  const steps        = getNextSteps(summary.disposition);
  const isUrgent     = ["ER_IMMEDIATE", "ER_URGENT", "URGENT_CARE_TODAY"].includes(summary.disposition);

  return (
    <div className="min-h-screen bg-background py-8 px-4" data-testid="page-living-encounter">
      <div className="max-w-lg mx-auto space-y-5">

        {/* Header */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Heart className="w-6 h-6 text-rose-500" />
            <span className="text-lg font-bold text-foreground">Auralyn Health</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Your Care Summary</h1>
          <p className="text-sm text-muted-foreground">
            Updated {new Date(summary.generatedAt).toLocaleString()}
          </p>
        </div>

        {/* Disposition Card */}
        <Card className={`${config.bg} ${config.border} border-2`} data-testid="card-disposition">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <ConfigIcon className={`w-7 h-7 flex-shrink-0 mt-0.5 ${config.text}`} />
              <div className="space-y-1.5">
                <h2 className={`text-lg font-bold ${config.text}`} data-testid="text-disposition-label">
                  {config.label}
                </h2>
                <p className={`text-sm ${config.text} opacity-90`} data-testid="text-disposition-action">
                  {config.action}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* One Liner */}
        {summary.oneLiner && (
          <Card data-testid="card-summary">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-muted-foreground" />
                What We Found
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground leading-relaxed" data-testid="text-one-liner">
                {summary.oneLiner}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Anatomical Diagram — appears between summary and next steps */}
        {shareToken && <DiagramCard shareToken={shareToken} />}

        {/* Next Steps */}
        <Card data-testid="card-next-steps">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Your Next Steps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm" data-testid={`text-step-${i}`}>
                  <ChevronRight className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Emergency Signs — always shown */}
        <Card className="border-red-200 dark:border-red-800" data-testid="card-emergency-signs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-4 h-4" />
              Call 911 Immediately If You Have:
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {EMERGENCY_SIGNS.map((sign, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300" data-testid={`text-emergency-sign-${i}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {sign}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Urgency badge */}
        {isUrgent && (
          <div className="flex justify-center" data-testid="badge-urgent">
            <Badge variant="destructive" className="text-xs">
              Time-sensitive — do not delay care
            </Badge>
          </div>
        )}

        {/* Footer */}
        <Separator />
        <p className="text-xs text-center text-muted-foreground pb-4">
          This summary is generated by AI-assisted triage and reviewed by licensed clinicians.
          It is not a substitute for professional medical advice.
        </p>
      </div>
    </div>
  );
}
