import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Activity, User, AlertTriangle, CheckCircle, Clock, ShieldAlert, RefreshCw, Plus } from "lucide-react";

interface PatientSession {
  id: string;
  status: "pending" | "approved" | "overridden" | "escalated";
  complaint?: string;
  age?: number;
  disposition?: string;
  riskLevel?: string;
  safetyFlags?: string[];
  override?: Record<string, any>;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

function riskBadge(risk?: string) {
  if (!risk) return <Badge variant="outline">unknown</Badge>;
  if (risk === "high") return <Badge className="bg-red-100 text-red-700 border-red-200" data-testid="badge-risk-high">HIGH</Badge>;
  if (risk === "medium") return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200" data-testid="badge-risk-medium">MED</Badge>;
  return <Badge className="bg-green-100 text-green-700 border-green-200" data-testid="badge-risk-low">LOW</Badge>;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-blue-100 text-blue-700",
    approved: "bg-green-100 text-green-700",
    overridden: "bg-orange-100 text-orange-700",
    escalated: "bg-red-100 text-red-700",
  };
  return <Badge className={map[status] ?? "bg-gray-100 text-gray-700"} data-testid={`badge-status-${status}`}>{status.toUpperCase()}</Badge>;
}

function PhysicianPanel({ patient, onAction }: { patient: PatientSession; onAction: () => void }) {
  const { toast } = useToast();

  const approveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/patients/approve/${patient.id}`, { physicianId: "physician-1" }),
    onSuccess: () => { toast({ title: "Approved", description: `Case ${patient.id} approved` }); queryClient.invalidateQueries({ queryKey: ["/api/patients/queue"] }); onAction(); },
  });

  const overrideMutation = useMutation({
    mutationFn: (diagnosis: string) => apiRequest("POST", `/api/patients/override/${patient.id}`, { diagnosis, physicianId: "physician-1" }),
    onSuccess: () => { toast({ title: "Overridden", description: `Custom diagnosis applied` }); queryClient.invalidateQueries({ queryKey: ["/api/patients/queue"] }); onAction(); },
  });

  const escalateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/patients/escalate/${patient.id}`, {}),
    onSuccess: () => { toast({ title: "Escalated", description: `Case ${patient.id} escalated` }); queryClient.invalidateQueries({ queryKey: ["/api/patients/queue"] }); onAction(); },
  });

  return (
    <div className="flex gap-2 flex-wrap">
      <Button
        size="sm"
        className="bg-green-600 hover:bg-green-700 text-white"
        onClick={() => approveMutation.mutate()}
        disabled={approveMutation.isPending || patient.status !== "pending"}
        data-testid={`button-approve-${patient.id}`}
      >
        <CheckCircle className="h-3 w-3 mr-1" /> Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="border-orange-300 text-orange-700 hover:bg-orange-50"
        onClick={() => overrideMutation.mutate("custom-override")}
        disabled={overrideMutation.isPending || patient.status === "approved"}
        data-testid={`button-override-${patient.id}`}
      >
        Override
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="border-red-300 text-red-700 hover:bg-red-50"
        onClick={() => escalateMutation.mutate()}
        disabled={escalateMutation.isPending || patient.status !== "pending"}
        data-testid={`button-escalate-${patient.id}`}
      >
        <ShieldAlert className="h-3 w-3 mr-1" /> Escalate
      </Button>
    </div>
  );
}

function NewPatientForm({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [complaint, setComplaint] = useState("sore-throat");
  const [age, setAge] = useState("35");

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/patients/session", {
        complaint,
        answers: { age: parseInt(age) || 35 },
      }),
    onSuccess: () => {
      toast({ title: "Patient queued", description: `New ${complaint} case added to queue` });
      queryClient.invalidateQueries({ queryKey: ["/api/patients/queue"] });
      onCreated();
    },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="flex gap-2 flex-wrap items-end">
      <div>
        <label className="text-xs text-muted-foreground">Complaint</label>
        <Input
          value={complaint}
          onChange={e => setComplaint(e.target.value)}
          className="w-40 h-8 text-sm"
          data-testid="input-complaint"
          placeholder="e.g. cough"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Age</label>
        <Input
          value={age}
          onChange={e => setAge(e.target.value)}
          className="w-20 h-8 text-sm"
          data-testid="input-age"
          type="number"
        />
      </div>
      <Button
        size="sm"
        onClick={() => createMutation.mutate()}
        disabled={createMutation.isPending}
        data-testid="button-add-patient"
      >
        <Plus className="h-3 w-3 mr-1" />
        {createMutation.isPending ? "Adding..." : "Add Patient"}
      </Button>
    </div>
  );
}

export default function PatientQueueDashboard() {
  const [selected, setSelected] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const { data: patients = [], isLoading, refetch } = useQuery<PatientSession[]>({
    queryKey: ["/api/patients/queue"],
    refetchInterval: 2000,
  });

  const pending = patients.filter(p => p.status === "pending");
  const approved = patients.filter(p => p.status === "approved");
  const escalated = patients.filter(p => p.status === "escalated");
  const selectedPatient = patients.find(p => p.id === selected);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-dashboard-title">
            <Activity className="h-6 w-6" /> Live Patient Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time patient triage · Physician review · Approve · Override · Escalate
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowNew(v => !v)} data-testid="button-new-patient">
            <Plus className="h-3 w-3 mr-1" /> New Patient
          </Button>
        </div>
      </div>

      {showNew && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Queue New Patient</CardTitle>
          </CardHeader>
          <CardContent>
            <NewPatientForm onCreated={() => setShowNew(false)} />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card data-testid="card-pending">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Pending</span>
            </div>
            <div className="text-2xl font-bold text-blue-600" data-testid="text-pending-count">{pending.length}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-approved">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Approved</span>
            </div>
            <div className="text-2xl font-bold text-green-600" data-testid="text-approved-count">{approved.length}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-escalated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Escalated</span>
            </div>
            <div className="text-2xl font-bold text-red-600" data-testid="text-escalated-count">{escalated.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" /> Patient Queue
              {isLoading && <span className="text-xs text-muted-foreground ml-2">Loading...</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {patients.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-empty-queue">No patients in queue</p>
            ) : (
              patients.map(p => (
                <div
                  key={p.id}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${selected === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  onClick={() => setSelected(p.id === selected ? null : p.id)}
                  data-testid={`card-patient-${p.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm font-medium" data-testid={`text-patient-id-${p.id}`}>{p.id}</span>
                      {p.complaint && (
                        <span className="text-xs text-muted-foreground">— {p.complaint}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {riskBadge(p.riskLevel)}
                      {statusBadge(p.status)}
                    </div>
                  </div>
                  {p.safetyFlags && p.safetyFlags.length > 0 && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {p.safetyFlags.map((f, i) => (
                        <span key={i} className="text-xs bg-red-50 text-red-600 border border-red-100 rounded px-1">
                          ⚠ {f.slice(0, 40)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" /> Physician Control Panel
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedPatient ? (
              <div className="text-center py-8 text-sm text-muted-foreground" data-testid="text-select-patient">
                Select a patient from the queue to review and act
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Patient ID</span>
                    <p className="font-medium" data-testid="text-selected-id">{selectedPatient.id}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <p>{statusBadge(selectedPatient.status)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Complaint</span>
                    <p className="font-medium" data-testid="text-selected-complaint">{selectedPatient.complaint ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Age</span>
                    <p className="font-medium" data-testid="text-selected-age">{selectedPatient.age ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Risk Level</span>
                    <p>{riskBadge(selectedPatient.riskLevel)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Disposition</span>
                    <p className="font-medium" data-testid="text-selected-disposition">{selectedPatient.disposition ?? "—"}</p>
                  </div>
                </div>

                {selectedPatient.safetyFlags && selectedPatient.safetyFlags.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-red-500" /> Safety Flags
                      </p>
                      <ul className="space-y-1">
                        {selectedPatient.safetyFlags.map((f, i) => (
                          <li key={i} className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Physician Actions</p>
                  <PhysicianPanel patient={selectedPatient} onAction={() => setSelected(null)} />
                </div>

                {selectedPatient.approvedBy && (
                  <p className="text-xs text-muted-foreground">
                    Handled by: <span className="font-medium">{selectedPatient.approvedBy}</span>
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
