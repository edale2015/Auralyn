import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  HeartPulse, Users, FileText, Activity, CheckCircle, Clock,
  AlertTriangle, Shield, Stethoscope, Send, Brain, Lock,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

function ConnectionTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/ehr/summary"] });
  const { data: rolesData } = useQuery<any>({ queryKey: ["/api/rbac/roles"] });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Checking EHR connection...</div>;

  return (
    <div className="space-y-6">
      <Card className={data?.connected ? "border-green-200 dark:border-green-800" : "border-red-200 dark:border-red-800"}>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3 mb-4">
            <div className={`h-3 w-3 rounded-full ${data?.connected ? "bg-green-500" : "bg-red-500"}`} />
            <span className="font-semibold" data-testid="text-ehr-status">{data?.connected ? "Connected" : "Disconnected"}</span>
            <Badge variant="outline" className="ml-auto">{data?.version || "FHIR R4"}</Badge>
          </div>
          <div className="text-sm text-muted-foreground" data-testid="text-ehr-url">{data?.ehrUrl}</div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Users className="h-5 w-5 mx-auto text-blue-600 mb-1" />
            <div className="text-3xl font-bold" data-testid="text-patient-count">{data?.resources?.patients || 0}</div>
            <div className="text-xs text-muted-foreground">Patients</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <FileText className="h-5 w-5 mx-auto text-purple-600 mb-1" />
            <div className="text-3xl font-bold" data-testid="text-encounter-count">{data?.resources?.encounters || 0}</div>
            <div className="text-xs text-muted-foreground">Encounters</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Activity className="h-5 w-5 mx-auto text-green-600 mb-1" />
            <div className="text-3xl font-bold" data-testid="text-obs-count">{data?.resources?.observations || 0}</div>
            <div className="text-xs text-muted-foreground">Observations</div>
          </CardContent>
        </Card>
      </div>

      {data?.encountersByStatus && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Encounter Status Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Badge variant="default" className="text-sm px-3 py-1"><CheckCircle className="h-3 w-3 mr-1" /> Finished: {data.encountersByStatus.finished}</Badge>
              <Badge variant="secondary" className="text-sm px-3 py-1"><Clock className="h-3 w-3 mr-1" /> In Progress: {data.encountersByStatus.inProgress}</Badge>
              <Badge className="text-sm px-3 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"><AlertTriangle className="h-3 w-3 mr-1" /> Triaged: {data.encountersByStatus.triaged}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {rolesData?.roles && (
        <Card>
          <CardHeader><CardTitle className="text-sm">RBAC Role Permissions</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3" data-testid="rbac-roles">
              {rolesData.roles.map((r: any) => (
                <div key={r.role} className="border rounded-lg p-3" data-testid={`role-${r.role}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm capitalize">{r.role}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{r.description}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {r.permissions.map((p: string) => (
                      <Badge key={p} variant="outline" className="text-xs"><Lock className="h-2 w-2 mr-1" />{p}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PatientsTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/ehr/patients"] });
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const { data: patientDetail } = useQuery<any>({
    queryKey: ["/api/ehr/patients", selectedPatient],
    enabled: !!selectedPatient,
  });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading patients...</div>;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">{data?.patients?.length || 0} Patients</h3>
          <div data-testid="patient-list">
            {data?.patients?.map((p: any) => (
              <div
                key={p.id}
                className={`p-3 rounded-lg border mb-2 cursor-pointer transition-colors ${selectedPatient === p.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                onClick={() => setSelectedPatient(p.id)}
                data-testid={`patient-${p.id}`}
              >
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{p.name?.[0]?.given?.join(" ")} {p.name?.[0]?.family}</span>
                  <Badge variant="outline" className="ml-auto text-xs">{p.gender}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">DOB: {p.birthDate} | ID: {p.id}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          {patientDetail ? (
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Patient Detail</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-sm space-y-1" data-testid="patient-detail">
                    <div><strong>Name:</strong> {patientDetail.patient?.name?.[0]?.given?.join(" ")} {patientDetail.patient?.name?.[0]?.family}</div>
                    <div><strong>Gender:</strong> {patientDetail.patient?.gender}</div>
                    <div><strong>DOB:</strong> {patientDetail.patient?.birthDate}</div>
                  </div>
                </CardContent>
              </Card>

              {patientDetail.encounters?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Encounters ({patientDetail.encounters.length})</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2" data-testid="patient-encounters">
                      {patientDetail.encounters.map((e: any) => (
                        <div key={e.id} className="p-2 rounded bg-muted/30 text-sm">
                          <div className="flex items-center gap-2">
                            <Badge variant={e.status === "finished" ? "default" : "secondary"} className="text-xs">{e.status}</Badge>
                            <span>{e.reasonCode?.[0]?.text}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {patientDetail.observations?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Observations ({patientDetail.observations.length})</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2" data-testid="patient-observations">
                      {patientDetail.observations.map((o: any) => (
                        <div key={o.id} className="flex items-center gap-2 p-2 rounded bg-muted/30 text-sm">
                          <Activity className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">{o.code?.text}</span>
                          <span className="ml-auto font-mono">
                            {o.valueQuantity ? `${o.valueQuantity.value} ${o.valueQuantity.unit}` : o.valueString || "N/A"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">Select a patient to view details</div>
          )}
        </div>
      </div>
    </div>
  );
}

function EncountersTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/ehr/encounters"] });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading encounters...</div>;

  const statusColor: Record<string, string> = {
    finished: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    "in-progress": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    triaged: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    planned: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm">{data?.encounters?.length || 0} Encounters</h3>
      <div className="space-y-3" data-testid="encounter-list">
        {data?.encounters?.map((e: any) => (
          <Card key={e.id} data-testid={`encounter-${e.id}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{e.reasonCode?.[0]?.text || "No reason"}</span>
                </div>
                <div className="flex gap-2">
                  <Badge className={`text-xs ${statusColor[e.status] || ""}`}>{e.status}</Badge>
                  <Badge variant="outline" className="text-xs">{e.class?.display}</Badge>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Patient: {e.subject?.reference} | ID: {e.id}
              </div>
              {e.diagnosis?.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {e.diagnosis.map((d: any, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">#{d.rank} {d.condition?.display}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function BrainToEHRTab() {
  const { data: patients } = useQuery<any>({ queryKey: ["/api/ehr/patients"] });
  const [patientId, setPatientId] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [result, setResult] = useState<any>(null);

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ehr/encounters/from-brain", { patientId, symptoms });
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/ehr/encounters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ehr/summary"] });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4" /> Clinical Brain → EHR Encounter
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Patient</label>
            <select
              className="w-full border rounded-md p-2 text-sm bg-background"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              data-testid="select-patient"
            >
              <option value="">Select a patient...</option>
              {patients?.patients?.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name?.[0]?.given?.join(" ")} {p.name?.[0]?.family} ({p.id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Symptoms</label>
            <Textarea
              placeholder="Enter symptoms..."
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              rows={3}
              data-testid="input-brain-symptoms"
            />
          </div>
          <Button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending || !patientId || !symptoms.trim()}
            className="w-full"
            data-testid="button-run-brain-ehr"
          >
            <Send className="h-4 w-4 mr-2" /> {runMutation.isPending ? "Processing..." : "Run Brain & Create Encounter"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-4">
          <Card className="border-green-200 dark:border-green-800">
            <CardHeader><CardTitle className="text-sm text-green-600">EHR Encounter Created</CardTitle></CardHeader>
            <CardContent>
              <div className="text-sm space-y-1" data-testid="encounter-result">
                <div><strong>Encounter ID:</strong> {result.encounter?.id}</div>
                <div><strong>Status:</strong> <Badge>{result.encounter?.status}</Badge></div>
                <div><strong>Class:</strong> {result.encounter?.class?.display}</div>
                <div><strong>Reason:</strong> {result.encounter?.reasonCode?.[0]?.text}</div>
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-lg font-bold" data-testid="text-brain-diagnosis">{result.brainResult?.decision?.diagnosis || "N/A"}</div>
                <div className="text-xs text-muted-foreground">Diagnosis</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-lg font-bold" data-testid="text-brain-disposition">{result.brainResult?.decision?.disposition || "N/A"}</div>
                <div className="text-xs text-muted-foreground">Disposition</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-lg font-bold">
                  {result.brainResult?.decision?.confidence ? `${(result.brainResult.decision.confidence * 100).toFixed(0)}%` : "N/A"}
                </div>
                <div className="text-xs text-muted-foreground">Confidence</div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EHRIntegrationDashboard() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-ehr-title">EHR Integration & Access Control</h1>
        <p className="text-sm text-muted-foreground mt-1">
          FHIR-based EHR integration, RBAC permissions, patient records, and clinical brain → EHR pipeline
        </p>
      </div>

      <Tabs defaultValue="connection" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="connection" data-testid="tab-connection">
            <HeartPulse className="h-4 w-4 mr-1" /> Connection
          </TabsTrigger>
          <TabsTrigger value="patients" data-testid="tab-patients">
            <Users className="h-4 w-4 mr-1" /> Patients
          </TabsTrigger>
          <TabsTrigger value="encounters" data-testid="tab-encounters">
            <FileText className="h-4 w-4 mr-1" /> Encounters
          </TabsTrigger>
          <TabsTrigger value="brain-ehr" data-testid="tab-brain-ehr">
            <Brain className="h-4 w-4 mr-1" /> Brain→EHR
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connection"><ConnectionTab /></TabsContent>
        <TabsContent value="patients"><PatientsTab /></TabsContent>
        <TabsContent value="encounters"><EncountersTab /></TabsContent>
        <TabsContent value="brain-ehr"><BrainToEHRTab /></TabsContent>
      </Tabs>
    </div>
  );
}
