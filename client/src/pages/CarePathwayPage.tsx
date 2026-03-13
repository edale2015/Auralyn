import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FlaskConical, Pill, UserCheck, Calendar, BookOpen, AlertCircle, CheckCircle2, Play } from "lucide-react";

interface CareStep {
  type: string;
  action: string;
  rationale: string;
  timing: string;
  priority: string;
  conditions?: string;
}

interface CarePathway {
  complaint: string;
  disposition: string;
  title: string;
  description: string;
  expectedDuration: string;
  steps: CareStep[];
  contraindications: string[];
  escalationCriteria: string[];
  outcomeGoals: string[];
}

const STEP_ICONS: Record<string, { icon: any; color: string; bg: string }> = {
  lab:         { icon: FlaskConical,  color: "text-blue-600",   bg: "bg-blue-50" },
  medication:  { icon: Pill,          color: "text-green-600",  bg: "bg-green-50" },
  referral:    { icon: UserCheck,     color: "text-purple-600", bg: "bg-purple-50" },
  followup:    { icon: Calendar,      color: "text-orange-600", bg: "bg-orange-50" },
  instruction: { icon: BookOpen,      color: "text-gray-600",   bg: "bg-gray-50" },
  monitoring:  { icon: AlertCircle,   color: "text-yellow-600", bg: "bg-yellow-50" },
};

const PRIORITY_COLORS: Record<string, string> = {
  stat:    "bg-red-100 text-red-800 border-red-200",
  urgent:  "bg-orange-100 text-orange-800 border-orange-200",
  routine: "bg-gray-100 text-gray-800 border-gray-200",
};

const COMPLAINTS = ["sore_throat", "uti", "cough", "ear_pain", "fever", "chest_pain", "rash", "sinus_pressure", "abdominal_pain"];
const DISPOSITIONS = ["Home Care", "Prescription", "Urgent Care", "ED"];

export default function CarePathwayPage() {
  const [selectedComplaint, setSelectedComplaint] = useState<string>("");
  const [selectedDisposition, setSelectedDisposition] = useState<string>("");
  const [executed, setExecuted] = useState<any | null>(null);

  const { data: allData, isLoading: allLoading } = useQuery<{ pathways: any[]; total: number }>({
    queryKey: ["/api/pathways"],
  });

  const { data: complaintData } = useQuery<{ pathways: CarePathway[] }>({
    queryKey: ["/api/pathways", selectedComplaint],
    enabled: !!selectedComplaint,
  });

  const executeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/pathways/execute", {
      complaint: selectedComplaint,
      disposition: selectedDisposition,
    }),
    onSuccess: (data: any) => setExecuted(data),
  });

  const complaint = complaintData?.pathways[0];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-green-600" />
          Care Pathway Automation
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Clinical care plans with labs, medications, referrals, and follow-up protocols per complaint and disposition
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Pathways</p>
            <p className="text-2xl font-bold" data-testid="stat-total-pathways">{allData?.total ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Complaints Covered</p>
            <p className="text-2xl font-bold">{COMPLAINTS.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Step Types</p>
            <p className="text-2xl font-bold">6</p>
            <p className="text-xs text-muted-foreground">Labs · Meds · Referrals · Follow-up · Instructions · Monitoring</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Execute a Care Pathway</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Complaint</label>
              <Select onValueChange={v => { setSelectedComplaint(v); setExecuted(null); }} data-testid="select-complaint">
                <SelectTrigger>
                  <SelectValue placeholder="Select complaint" />
                </SelectTrigger>
                <SelectContent>
                  {COMPLAINTS.map(c => (
                    <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Disposition</label>
              <Select onValueChange={v => { setSelectedDisposition(v); setExecuted(null); }} data-testid="select-disposition">
                <SelectTrigger>
                  <SelectValue placeholder="Select disposition" />
                </SelectTrigger>
                <SelectContent>
                  {DISPOSITIONS.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={() => executeMutation.mutate()}
                disabled={!selectedComplaint || !selectedDisposition || executeMutation.isPending}
                data-testid="button-execute-pathway"
              >
                <Play className="h-4 w-4 mr-2" />
                {executeMutation.isPending ? "Executing…" : "Execute Pathway"}
              </Button>
            </div>
          </div>

          {complaintData?.pathways && complaintData.pathways.length > 0 && !executed && (
            <div className="pt-2 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Available pathways for {selectedComplaint.replace(/_/g, " ")}:</p>
              {complaintData.pathways.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-sm border rounded-lg p-2">
                  <Badge variant="outline">{p.disposition}</Badge>
                  <span className="font-medium">{p.title}</span>
                  <span className="text-muted-foreground ml-auto">{p.expectedDuration}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {executed && (
        <Card className="border-green-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{executed.pathway.title}</CardTitle>
              <Badge className="bg-green-600">{executed.pathway.expectedDuration}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{executed.pathway.description}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="border rounded-lg p-2 bg-blue-50 text-center">
                <p className="text-2xl font-bold text-blue-700">{executed.statSummary.labsOrdered.length}</p>
                <p className="text-xs text-blue-600">Labs Ordered</p>
              </div>
              <div className="border rounded-lg p-2 bg-green-50 text-center">
                <p className="text-2xl font-bold text-green-700">{executed.statSummary.medicationsPrescribed.length}</p>
                <p className="text-xs text-green-600">Medications</p>
              </div>
              <div className="border rounded-lg p-2 bg-purple-50 text-center">
                <p className="text-2xl font-bold text-purple-700">{executed.statSummary.referralsPlaced.length}</p>
                <p className="text-xs text-purple-600">Referrals</p>
              </div>
              <div className="border rounded-lg p-2 bg-orange-50 text-center">
                <p className="text-2xl font-bold text-orange-700">{executed.statSummary.followupScheduled.length}</p>
                <p className="text-xs text-orange-600">Follow-ups</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Clinical Steps</p>
              {executed.pathway.steps.map((step: CareStep, i: number) => {
                const cfg = STEP_ICONS[step.type] ?? STEP_ICONS.instruction;
                const Icon = cfg.icon;
                return (
                  <div key={i} className={`flex gap-3 rounded-lg p-3 border ${cfg.bg}`} data-testid={`step-${i}`}>
                    <div className={`flex-shrink-0 rounded-full p-1.5 ${cfg.bg}`}>
                      <Icon className={`h-4 w-4 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{step.action}</span>
                        <Badge className={`text-xs border ${PRIORITY_COLORS[step.priority]}`}>{step.priority}</Badge>
                        <span className="text-xs text-muted-foreground">{step.timing}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{step.rationale}</p>
                      {step.conditions && (
                        <p className="text-xs text-orange-700 mt-0.5 font-medium">If: {step.conditions}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <Accordion type="multiple">
              {executed.statSummary.contraindications.length > 0 && (
                <AccordionItem value="contra">
                  <AccordionTrigger className="text-sm text-red-700 font-medium">
                    Contraindications ({executed.statSummary.contraindications.length})
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-1">
                      {executed.statSummary.contraindications.map((c: string, i: number) => (
                        <li key={i} className="text-sm flex gap-2"><AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />{c}</li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              )}
              <AccordionItem value="escalation">
                <AccordionTrigger className="text-sm font-medium">
                  Escalation Criteria ({executed.statSummary.escalationCriteria.length})
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-1">
                    {executed.statSummary.escalationCriteria.map((c: string, i: number) => (
                      <li key={i} className="text-sm flex gap-2 text-orange-700"><AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />{c}</li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="goals">
                <AccordionTrigger className="text-sm font-medium">Outcome Goals</AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-1">
                    {executed.pathway.outcomeGoals.map((g: string, i: number) => (
                      <li key={i} className="text-sm flex gap-2 text-green-700"><CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />{g}</li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Pathway Index</CardTitle>
        </CardHeader>
        <CardContent>
          {allLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(allData?.pathways ?? []).map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-2 border rounded-lg p-3 text-sm" data-testid={`pathway-index-${i}`}>
                  <div className="flex-1">
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">{p.complaint.replace(/_/g, " ")} · {p.stepCount} steps · {p.expectedDuration}</p>
                  </div>
                  <Badge variant="outline">{p.disposition}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
