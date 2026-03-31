import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/AdminLayout";
import MultiPatientGrid, { type PatientRow } from "@/components/command/MultiPatientGrid";
import OutreachPanel from "@/components/command/OutreachPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Database,
  Grid3X3,
  MessageSquare,
  Users,
  Zap,
} from "lucide-react";

export default function MultiPatientCommandPage() {
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(null);
  const { toast } = useToast();

  const seedMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/command/admission-risk/seed").then(r => r.json()),
    onSuccess: d => {
      queryClient.invalidateQueries({ queryKey: ["/api/command/admission-risk"] });
      toast({ title: "KB Rules Seeded", description: `${d.seeded} admission risk rules loaded` });
    },
    onError: (e: any) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  return (
    <AdminLayout title="Multi-Patient Command Grid">
      <div className="flex flex-col h-full min-h-0">

        {/* Page header */}
        <div className="flex items-center justify-between p-4 pb-3 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded bg-red-600/20 border border-red-500/30">
              <Grid3X3 size={18} className="text-red-400" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Multi-Patient Command Grid</h1>
              <p className="text-xs text-muted-foreground">Hospital-style risk-sorted dashboard · KB-driven admission scoring · Automated outreach</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
        </div>

        {/* Feature badges */}
        <div className="flex gap-2 px-4 py-2 border-b bg-muted/30 flex-shrink-0 flex-wrap">
          <Badge variant="outline" className="text-[11px] gap-1 text-red-400 border-red-500/30">
            <Users size={11} /> Risk-Sorted Grid
          </Badge>
          <Badge variant="outline" className="text-[11px] gap-1 text-blue-400 border-blue-500/30">
            <MessageSquare size={11} /> Automated Outreach Agent
          </Badge>
          <Badge variant="outline" className="text-[11px] gap-1 text-purple-400 border-purple-500/30">
            <BrainCircuit size={11} /> Predictive Admission Risk
          </Badge>
          <Badge variant="outline" className="text-[11px] gap-1 text-yellow-400 border-yellow-500/30">
            <Zap size={11} /> SMS · WhatsApp · Voice TTS
          </Badge>
          <Badge variant="outline" className="text-[11px] gap-1 text-green-400 border-green-500/30">
            <Activity size={11} /> 16 KB Rules Active
          </Badge>
        </div>

        {/* Three-pane layout */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* LEFT: Patient grid */}
          <div className="w-[380px] flex-shrink-0 border-r flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b">
              <Users size={13} className="text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patients</span>
            </div>
            <MultiPatientGrid
              selected={selectedPatient?.patient_id ?? null}
              onSelect={p => setSelectedPatient(p)}
            />
          </div>

          {/* MIDDLE: Selected patient detail */}
          <div className="flex-1 border-r flex flex-col min-w-0">
            {selectedPatient ? (
              <>
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b flex-shrink-0">
                  <Activity size={13} className="text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Clinical Detail — {selectedPatient.name}
                  </span>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-4">
                    {/* Diagnosis */}
                    <Card className="p-3 border-border/50">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Top Diagnosis</div>
                      <div className="font-mono text-sm font-semibold text-blue-400" data-testid="text-top-dx">
                        {selectedPatient.top_dx?.replace("DX_BAY_", "").replace(/_/g, " ")}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{selectedPatient.chief_complaint}</div>
                    </Card>

                    {/* Disposition */}
                    <Card className="p-3 border-border/50">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Disposition</div>
                      <div className="font-semibold text-sm capitalize" data-testid="text-disposition">
                        {selectedPatient.disposition?.replace(/_/g, " ")}
                      </div>
                    </Card>

                    {/* Vitals */}
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

                    {/* Risk flags */}
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

                    {/* Admission Risk Score */}
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

                    {/* Last seen */}
                    <div className="text-[11px] text-muted-foreground text-right">
                      Last updated: {new Date(selectedPatient.last_update).toLocaleString()}
                    </div>
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <Grid3X3 size={40} className="mb-3 opacity-30" />
                <div className="text-sm">Select a patient to view details</div>
                <div className="text-xs mt-1 opacity-60">Patients sorted by risk score (highest first)</div>
              </div>
            )}
          </div>

          {/* RIGHT: Outreach panel */}
          <div className="w-[360px] flex-shrink-0 flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b flex-shrink-0">
              <MessageSquare size={13} className="text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outreach Agent</span>
            </div>
            {selectedPatient ? (
              <OutreachPanel patient={selectedPatient} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                <MessageSquare size={36} className="mb-3 opacity-20" />
                <div className="text-sm">Select a patient to activate outreach</div>
                <Separator className="my-4 w-16" />
                <div className="text-xs opacity-60 leading-relaxed">
                  Send SMS, WhatsApp, or voice TTS alerts to patients based on their triage risk level
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
