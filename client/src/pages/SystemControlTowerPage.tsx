import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import {
  Cpu, Activity, Plug, Layers, Database,
  Terminal, Mic, Bot, AlertTriangle, Zap, Radio,
  ExternalLink, RefreshCw
} from "lucide-react";

import AgentsPanel from "@/components/tower/AgentsPanel";
import EnginesPanel from "@/components/tower/EnginesPanel";
import IntegrationsPanel from "@/components/tower/IntegrationsPanel";
import LivePatientsPanel from "@/components/tower/LivePatientsPanel";
import DeteriorationAlertsPanel from "@/components/tower/DeteriorationAlertsPanel";
import VoiceIntakePanel from "@/components/tower/VoiceIntakePanel";
import { SkillsPanel, LayersPanel } from "@/components/tower/SkillsLayersPanel";
import LiveLogsPanel from "@/components/tower/LiveLogsPanel";
import RobotExamPanel from "@/components/tower/RobotExamPanel";

interface SystemHealth {
  ok: boolean;
  patientStreamEvents: number;
  robotDevices: number;
  robotCommands: number;
  deteriorationRules: number;
  engineCount: number;
  skillCount: number;
  uptime: number;
}

const SECTION_TABS = [
  { value: "agents",       label: "Agents",        icon: Bot },
  { value: "engines",      label: "Engines",       icon: Activity },
  { value: "integrations", label: "Integrations",  icon: Plug },
  { value: "skills",       label: "Skills",        icon: Database },
  { value: "layers",       label: "Layers",        icon: Layers },
  { value: "robot",        label: "Robot Exam",    icon: Cpu },
  { value: "patients",     label: "Live Patients", icon: Radio },
  { value: "alerts",       label: "Alerts",        icon: AlertTriangle },
  { value: "voice",        label: "Voice Intake",  icon: Mic },
  { value: "logs",         label: "System Logs",   icon: Terminal },
];

export default function SystemControlTowerPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("agents");

  const { data: health, refetch: refetchHealth } = useQuery<SystemHealth>({
    queryKey: ["/api/sysctrl/health"],
    refetchInterval: 10000,
  });

  const seedDet = useMutation({
    mutationFn: async () => { const r = await apiRequest("POST", "/api/sysctrl/seed-deterioration", {}); return r.json(); },
    onSuccess: (d: any) => { toast({ title: "Deterioration rules seeded", description: `${d.seeded} rules` }); refetchHealth(); },
    onError: (e: Error) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const pushDemo = useMutation({
    mutationFn: async () => {
      const events = [
        { patient_id: "p1", feature_key: "heart_rate", value: 130 },
        { patient_id: "p1", feature_key: "spo2",       value: 92 },
        { patient_id: "p2", feature_key: "systolic_bp", value: 85 },
      ];
      for (const e of events) {
        await apiRequest("POST", "/api/sysctrl/stream", e);
      }
    },
    onSuccess: () => toast({ title: "Demo stream pushed", description: "3 vitals events sent" }),
  });

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2 border-b bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Cpu className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-base font-bold leading-tight">System Control Tower</h1>
            <p className="text-xs text-muted-foreground">Complete system visibility — monitor, update, troubleshoot, control</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {health && (
            <>
              <Badge variant="outline" className="gap-1 text-xs">
                <Activity className="h-3 w-3" />
                {health.engineCount} engines · {health.skillCount} skills
              </Badge>
              <Badge variant="outline" className="gap-1 text-xs">
                <Cpu className="h-3 w-3" />
                {health.robotDevices} devices · {health.robotCommands} cmds
              </Badge>
              <Badge variant="secondary" className="text-xs">
                up {Math.floor(health.uptime / 60)}m
              </Badge>
            </>
          )}
          <Button
            size="sm" variant="outline" className="h-7 px-2"
            onClick={() => refetchHealth()}
            data-testid="button-refresh-health"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button
            size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => seedDet.mutate()}
            disabled={seedDet.isPending}
            data-testid="button-seed-deterioration"
          >
            <Zap className="h-3 w-3 mr-1" />Seed Rules
          </Button>
          <Button
            size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => pushDemo.mutate()}
            disabled={pushDemo.isPending}
            data-testid="button-push-demo-stream"
          >
            <Radio className="h-3 w-3 mr-1" />Demo Stream
          </Button>
          <Button
            size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => window.open("/clinical-control-tower", "_blank")}
            data-testid="button-open-cct"
          >
            <ExternalLink className="h-3 w-3 mr-1" />CCT Engine
          </Button>
        </div>
      </div>

      {/* 2-column layout: narrow tabs sidebar + main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Tab selector sidebar */}
        <div className="w-40 shrink-0 border-r bg-card flex flex-col overflow-y-auto">
          <div className="px-3 py-2 border-b">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Panels</p>
          </div>
          <div className="py-1">
            {SECTION_TABS.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  onClick={() => setActiveTab(t.value)}
                  data-testid={`nav-${t.value}`}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                    activeTab === t.value
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main panel */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4">
              {/* Live Logs always visible at top for quick debugging */}
              {activeTab === "logs" && <LiveLogsPanel />}
              {activeTab === "agents" && (
                <PanelWrapper title="Agents" description="Toggle and monitor clinical agents. Changes take effect immediately.">
                  <AgentsPanel />
                </PanelWrapper>
              )}
              {activeTab === "engines" && (
                <PanelWrapper title="Engines" description="Live status, latency, and error rate for all clinical engines.">
                  <EnginesPanel />
                </PanelWrapper>
              )}
              {activeTab === "integrations" && (
                <PanelWrapper title="Integrations" description="System integration health — Postgres, OpenAI, Telegram, EHR.">
                  <IntegrationsPanel />
                </PanelWrapper>
              )}
              {activeTab === "skills" && (
                <PanelWrapper title="KB Skills" description="Knowledge base table row counts. Edit via KB Admin page.">
                  <SkillsPanel />
                </PanelWrapper>
              )}
              {activeTab === "layers" && (
                <PanelWrapper title="Architecture Layers" description="Toggle 12 system layers on/off. Use with caution in production.">
                  <LayersPanel />
                </PanelWrapper>
              )}
              {activeTab === "robot" && (
                <PanelWrapper title="Robotic Exam" description="Issue commands to connected exam devices (otoscope, vitals, EKG).">
                  <RobotExamPanel />
                </PanelWrapper>
              )}
              {activeTab === "patients" && (
                <PanelWrapper title="Live Patients" description="Real-time patient vital stream over WebSocket (/ws/patient-stream).">
                  <LivePatientsPanel />
                </PanelWrapper>
              )}
              {activeTab === "alerts" && (
                <PanelWrapper title="Deterioration Alerts" description="KB-driven deterioration detection. Seed rules first, then push vitals stream.">
                  <DeteriorationAlertsPanel />
                </PanelWrapper>
              )}
              {activeTab === "voice" && (
                <PanelWrapper title="Voice Intake" description="Submit voice transcript for multimodal intake processing.">
                  <VoiceIntakePanel />
                </PanelWrapper>
              )}
            </div>
          </ScrollArea>

          {/* Bottom: Health stats */}
          {health && (
            <div className="border-t bg-card px-4 py-1.5 shrink-0 flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
              <span>Stream events: <strong className="text-foreground">{health.patientStreamEvents}</strong></span>
              <span>Deterioration rules: <strong className="text-foreground">{health.deteriorationRules}</strong></span>
              <span>Robot commands: <strong className="text-foreground">{health.robotCommands}</strong></span>
              <span className="ml-auto">Uptime: <strong className="text-foreground">{Math.floor(health.uptime / 60)}m {health.uptime % 60}s</strong></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PanelWrapper({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
