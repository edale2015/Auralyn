import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/AdminLayout";
import MultiPatientGrid, { type PatientRow } from "@/components/command/MultiPatientGrid";
import OutreachPanel from "@/components/command/OutreachPanel";
import PhysicianAlertPanel from "@/components/command/PhysicianAlertPanel";
import HospitalRoutingPanel from "@/components/command/HospitalRoutingPanel";
import ICUWaveform from "@/components/command/ICUWaveform";
import SystemHealthPanel from "@/components/command/SystemHealthPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  Bell,
  BrainCircuit,
  Building2,
  Database,
  Grid3X3,
  Heart,
  MessageSquare,
  Siren,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

type MiddleTab = "clinical" | "waveform" | "hospital";
type RightTab  = "outreach" | "physician";

export default function MultiPatientCommandPage() {
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(null);
  const [middleTab, setMiddleTab] = useState<MiddleTab>("clinical");
  const [rightTab, setRightTab]   = useState<RightTab>("outreach");
  const { toast } = useToast();

  const seedMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/command/admission-risk/seed").then(r => r.json()),
    onSuccess: d => {
      queryClient.invalidateQueries({ queryKey: ["/api/command/admission-risk"] });
      toast({ title: "KB Rules Seeded", description: `${d.seeded} admission risk rules loaded` });
    },
    onError: (e: any) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const middleTabs: Array<{ id: MiddleTab; label: string; icon: any }> = [
    { id: "clinical",  label: "Clinical",       icon: Activity },
    { id: "waveform",  label: "ICU Waveforms",  icon: Heart },
    { id: "hospital",  label: "Hospital + EMS", icon: Building2 },
  ];

  const rightTabs: Array<{ id: RightTab; label: string; icon: any }> = [
    { id: "outreach",   label: "Outreach",  icon: MessageSquare },
    { id: "physician",  label: "Physician Paging", icon: Bell },
  ];

  return (
    <AdminLayout title="Multi-Patient Command Grid">
      <div className="flex flex-col h-full min-h-0">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded bg-red-600/20 border border-red-500/30">
              <Grid3X3 size={18} className="text-red-400" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Multi-Patient Command Grid</h1>
              <p className="text-xs text-muted-foreground">KB-driven clinical command centre · 8 optional modules</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => seedMut.mutate()}
            disabled={seedMut.isPending}
            data-testid="button-seed-kb-rules"
          >
            <Database size={12} className="mr-1.5" />
            Seed KB Rules
          </Button>
        </div>

        {/* ── Feature badges ── */}
        <div className="flex gap-2 px-4 py-2 border-b bg-muted/30 flex-shrink-0 flex-wrap">
          {[
            { icon: Users,        label: "Risk-Sorted Grid",         color: "text-red-400 border-red-500/30" },
            { icon: MessageSquare,label: "Automated Outreach",        color: "text-blue-400 border-blue-500/30" },
            { icon: BrainCircuit, label: "Admission Risk (16 rules)", color: "text-purple-400 border-purple-500/30" },
            { icon: Heart,        label: "ICU Waveforms",             color: "text-pink-400 border-pink-500/30" },
            { icon: Building2,    label: "Auto Hospital Selection",   color: "text-green-400 border-green-500/30" },
            { icon: Siren,        label: "EMS ETA Tracking",          color: "text-orange-400 border-orange-500/30" },
            { icon: Bell,         label: "Physician Auto-Paging",     color: "text-yellow-400 border-yellow-500/30" },
            { icon: Activity,     label: "System Health",             color: "text-cyan-400 border-cyan-500/30" },
          ].map(b => (
            <Badge key={b.label} variant="outline" className={`text-[11px] gap-1 ${b.color}`}>
              <b.icon size={11} /> {b.label}
            </Badge>
          ))}
        </div>

        {/* ── Main 3-pane layout ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* LEFT: Patient grid */}
          <div className="w-[360px] flex-shrink-0 border-r flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Users size={12} /> Patients (risk sorted)
            </div>
            <MultiPatientGrid
              selected={selectedPatient?.patient_id ?? null}
              onSelect={p => { setSelectedPatient(p); setMiddleTab("clinical"); }}
            />
          </div>

          {/* MIDDLE: Tabbed clinical / waveform / hospital */}
          <div className="flex-1 border-r flex flex-col min-w-0">
            {/* Tab bar */}
            <div className="flex border-b bg-muted/20 flex-shrink-0">
              {middleTabs.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    data-testid={`tab-middle-${t.id}`}
                    onClick={() => setMiddleTab(t.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors",
                      middleTab === t.id
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon size={12} /> {t.label}
                  </button>
                );
              })}
            </div>

            {/* Middle content */}
            <div className="flex-1 overflow-hidden">
              {selectedPatient ? (
                <>
                  {/* Clinical detail tab */}
                  {middleTab === "clinical" && (
                    <ScrollArea className="h-full">
                      <div className="p-4 space-y-4">
                        <Card className="p-3 border-border/50">
                          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Top Diagnosis</div>
                          <div className="font-mono text-sm font-semibold text-blue-400" data-testid="text-top-dx">
                            {selectedPatient.top_dx?.replace("DX_BAY_", "").replace(/_/g, " ")}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">{selectedPatient.chief_complaint}</div>
                        </Card>
                        <Card className="p-3 border-border/50">
                          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Disposition</div>
                          <div className="font-semibold text-sm capitalize" data-testid="text-disposition">
                            {selectedPatient.disposition?.replace(/_/g, " ")}
                          </div>
                        </Card>
                        {Object.keys(selectedPatient.vitals ?? {}).length > 0 && (
                          <Card className="p-3 border-border/50">
                            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Vitals</div>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(selectedPatient.vitals).map(([key, val]) => (
                                <div key={key} className="flex justify-between text-xs">
                                  <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                                  <span className="font-semibold">{val as number}</span>
                                </div>
                              ))}
                            </div>
                          </Card>
                        )}
                        {(selectedPatient.flags ?? []).length > 0 && (
                          <Card className="p-3 border-red-500/20 bg-red-500/5">
                            <div className="text-xs text-red-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                              <AlertTriangle size={11} /> Risk Flags
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedPatient.flags.map(f => (
                                <Badge key={f} variant="outline" className="text-[10px] text-red-400 border-red-500/30 bg-red-500/10">
                                  {f.replace(/_/g, " ")}
                                </Badge>
                              ))}
                            </div>
                          </Card>
                        )}
                        <Card className="p-3 border-yellow-500/20 bg-yellow-500/5">
                          <div className="text-xs text-yellow-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                            <BrainCircuit size={11} /> Predictive Admission Risk
                          </div>
                          <div className="flex items-end gap-2">
                            <div className="text-3xl font-black text-yellow-400" data-testid="text-adm-risk-detail">
                              {Math.round((selectedPatient.admission_risk ?? 0) * 100)}%
                            </div>
                            <div className="text-xs text-muted-foreground pb-1">probability</div>
                          </div>
                          <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-red-500 transition-all"
                              style={{ width: `${Math.round((selectedPatient.admission_risk ?? 0) * 100)}%` }}
                            />
                          </div>
                        </Card>
                        <div className="text-[11px] text-muted-foreground text-right">
                          Last updated: {new Date(selectedPatient.last_update).toLocaleString()}
                        </div>
                      </div>
                    </ScrollArea>
                  )}

                  {/* ICU Waveform tab */}
                  {middleTab === "waveform" && (
                    <ScrollArea className="h-full">
                      <ICUWaveform patient={selectedPatient} />
                    </ScrollArea>
                  )}

                  {/* Hospital + EMS tab */}
                  {middleTab === "hospital" && (
                    <HospitalRoutingPanel patient={selectedPatient} />
                  )}
                </>
              ) : (
                <div className="flex-1 h-full flex flex-col items-center justify-center text-muted-foreground">
                  <Grid3X3 size={40} className="mb-3 opacity-30" />
                  <div className="text-sm">Select a patient to view details</div>
                  <div className="text-xs mt-1 opacity-60">Patients sorted by risk score (highest first)</div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Tabbed outreach / physician paging */}
          <div className="w-[360px] flex-shrink-0 flex flex-col">
            {/* Tab bar */}
            <div className="flex border-b bg-muted/20 flex-shrink-0">
              {rightTabs.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    data-testid={`tab-right-${t.id}`}
                    onClick={() => setRightTab(t.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors",
                      rightTab === t.id
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon size={12} /> {t.label}
                  </button>
                );
              })}
            </div>

            {/* Right content */}
            <div className="flex-1 overflow-hidden">
              {selectedPatient ? (
                <>
                  {rightTab === "outreach"  && <OutreachPanel patient={selectedPatient} />}
                  {rightTab === "physician" && <PhysicianAlertPanel patient={selectedPatient} />}
                </>
              ) : (
                <div className="flex-1 h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                  <MessageSquare size={36} className="mb-3 opacity-20" />
                  <div className="text-sm">Select a patient to activate outreach</div>
                  <Separator className="my-4 w-16" />
                  <div className="text-xs opacity-60 leading-relaxed">
                    SMS · WhatsApp · Voice TTS · Physician Paging
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom: System Health Panel ── */}
        <div className="border-t flex-shrink-0 max-h-[220px] overflow-y-auto">
          <SystemHealthPanel />
        </div>
      </div>
    </AdminLayout>
  );
}
