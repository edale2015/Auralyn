import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PlusCircle, FlaskConical, CheckCircle, ChevronDown, ChevronUp, Trash2, Download } from "lucide-react";

interface CaseField { id: string; label: string; type: string; options?: string[]; unit?: string; required: boolean; clinicalMeaning: string; }
interface GoldenCaseTemplate { complaint: string; label: string; fields: CaseField[]; expectedDispositions: string[]; commonDiagnoses: string[]; }
interface ComplaintLabel { value: string; label: string; }
interface GoldenCase { id: string; complaint: string; answers: Record<string, unknown>; symptoms: string[]; expectedDiagnosis: string; expectedDisposition: string; notes?: string; createdBy: string; createdAt: string; tags?: string[]; }

const DISPOSITIONS = ['HOME_CARE', 'VIDEO_VISIT', 'OFFICE_24H', 'URGENT_SAME_DAY', 'ER_NOW', 'NEEDS_PHYSICIAN_REVIEW', 'NEEDS_WORKUP', 'BLOCK'];
const DISP_COLORS: Record<string, string> = { HOME_CARE: 'bg-green-100 text-green-800', VIDEO_VISIT: 'bg-blue-100 text-blue-800', OFFICE_24H: 'bg-cyan-100 text-cyan-800', URGENT_SAME_DAY: 'bg-yellow-100 text-yellow-800', ER_NOW: 'bg-red-100 text-red-800', NEEDS_PHYSICIAN_REVIEW: 'bg-orange-100 text-orange-800', NEEDS_WORKUP: 'bg-purple-100 text-purple-800', BLOCK: 'bg-gray-100 text-gray-800' };

function FieldInput({ field, value, onChange }: { field: CaseField; value: unknown; onChange: (v: unknown) => void }) {
  if (field.type === 'boolean') {
    return (
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="flex-1">
          <div className="text-sm font-medium">{field.label}{field.required && <span className="text-red-500 ml-1">*</span>}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{field.clinicalMeaning}</div>
        </div>
        <Switch data-testid={`switch-${field.id}`} checked={!!value} onCheckedChange={onChange} />
      </div>
    );
  }
  if (field.type === 'select') {
    return (
      <div>
        <Label className="text-sm">{field.label}{field.required && <span className="text-red-500 ml-1">*</span>}</Label>
        <div className="text-xs text-muted-foreground mb-1">{field.clinicalMeaning}</div>
        <Select value={String(value ?? '')} onValueChange={onChange}>
          <SelectTrigger data-testid={`select-${field.id}`}><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>{(field.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    );
  }
  if (field.type === 'multiselect') {
    const current = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (opt: string) => onChange(current.includes(opt) ? current.filter((x) => x !== opt) : [...current, opt]);
    return (
      <div>
        <Label className="text-sm">{field.label}{field.required && <span className="text-red-500 ml-1">*</span>}</Label>
        <div className="text-xs text-muted-foreground mb-2">{field.clinicalMeaning}</div>
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((opt) => (
            <button key={opt} data-testid={`multiselect-${field.id}-${opt}`} type="button"
              onClick={() => toggle(opt)}
              className={`px-2 py-1 rounded-full text-xs border transition-colors ${current.includes(opt) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      <Label className="text-sm">{field.label}{field.required && <span className="text-red-500 ml-1">*</span>}{field.unit && <span className="text-muted-foreground ml-1">({field.unit})</span>}</Label>
      <div className="text-xs text-muted-foreground mb-1">{field.clinicalMeaning}</div>
      <Input data-testid={`input-${field.id}`} type={field.type === 'number' ? 'number' : 'text'} value={String(value ?? '')} onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)} />
    </div>
  );
}

export default function GoldenCasesPage() {
  const { toast } = useToast();
  const [selectedComplaint, setSelectedComplaint] = useState<string>('');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [symptoms, setSymptoms] = useState('');
  const [expectedDx, setExpectedDx] = useState('');
  const [expectedDisp, setExpectedDisp] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [filterComplaint, setFilterComplaint] = useState('all');
  const [expandedCase, setExpandedCase] = useState<string | null>(null);

  const { data: templatesData } = useQuery<{ templates: GoldenCaseTemplate[]; complaints: ComplaintLabel[] }>({
    queryKey: ['/api/golden-cases/templates'],
  });
  const { data: cases, isLoading } = useQuery<GoldenCase[]>({ queryKey: ['/api/golden-cases'] });

  const template = templatesData?.templates.find((t) => t.complaint === selectedComplaint);

  const createMutation = useMutation({
    mutationFn: async (payload: object) => {
      const res = await apiRequest('POST', '/api/golden-cases', payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/golden-cases'] });
      toast({ title: 'Golden case created', description: `${selectedComplaint} case saved.` });
      setAnswers({}); setSymptoms(''); setExpectedDx(''); setExpectedDisp(''); setNotes(''); setTags(''); setShowForm(false);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const res = await apiRequest('DELETE', `/api/golden-cases/${id}`); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/golden-cases'] }); toast({ title: 'Deleted' }); },
  });

  const handleSubmit = () => {
    if (!selectedComplaint || !expectedDx || !expectedDisp) {
      toast({ title: 'Missing fields', description: 'Complaint, expected diagnosis, and expected disposition are required.', variant: 'destructive' }); return;
    }
    createMutation.mutate({
      complaint: selectedComplaint,
      answers,
      symptoms: symptoms.split(',').map((s) => s.trim()).filter(Boolean),
      expectedDiagnosis: expectedDx,
      expectedDisposition: expectedDisp,
      notes: notes || undefined,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
  };

  const filteredCases = (cases ?? []).filter((c) => filterComplaint === 'all' || c.complaint === filterComplaint);
  const complaints = templatesData?.complaints ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-emerald-500" />
            Golden Cases
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Create and manage expert-labeled test cases for clinical brain validation</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" data-testid="button-export-csv"
            onClick={() => { window.location.href = '/api/gold-reviews/export?format=csv'; }}
            className="gap-1.5 text-sm">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" data-testid="button-export-json"
            onClick={() => { window.location.href = '/api/gold-reviews/export?format=json'; }}
            className="gap-1.5 text-sm">
            <Download className="h-3.5 w-3.5" /> Export JSON
          </Button>
          <Button data-testid="button-new-golden-case" onClick={() => setShowForm(!showForm)} variant={showForm ? 'secondary' : 'default'} className="gap-2">
            <PlusCircle className="h-4 w-4" /> {showForm ? 'Cancel' : 'New Golden Case'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 flex-wrap">
        <div className="px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-center">
          <div className="text-xl font-bold text-emerald-600">{cases?.length ?? 0}</div>
          <div className="text-xs text-muted-foreground">Total Cases</div>
        </div>
        {complaints.slice(0, 6).map((c) => {
          const count = (cases ?? []).filter((x) => x.complaint === c.value).length;
          return count > 0 ? (
            <div key={c.value} className="px-3 py-2 rounded-lg bg-muted border text-center">
              <div className="text-lg font-bold">{count}</div>
              <div className="text-xs text-muted-foreground">{c.label}</div>
            </div>
          ) : null;
        })}
      </div>

      {/* New Case Form */}
      {showForm && (
        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Golden Case</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Complaint selector */}
            <div>
              <Label>Complaint <span className="text-red-500">*</span></Label>
              <Select value={selectedComplaint} onValueChange={(v) => { setSelectedComplaint(v); setAnswers({}); }}>
                <SelectTrigger data-testid="select-complaint"><SelectValue placeholder="Select complaint…" /></SelectTrigger>
                <SelectContent>
                  {complaints.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic complaint fields */}
            {template && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground font-medium">{template.label} — Clinical Questions</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                {template.fields.map((field) => (
                  <FieldInput key={field.id} field={field} value={answers[field.id]} onChange={(v) => setAnswers((a) => ({ ...a, [field.id]: v }))} />
                ))}
              </div>
            )}

            {/* Symptoms, diagnosis, disposition */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Symptoms (comma-separated)</Label>
                <Input data-testid="input-symptoms" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="fever, cough, dyspnea" />
              </div>
              <div>
                <Label>Expected Diagnosis <span className="text-red-500">*</span></Label>
                {template ? (
                  <Select value={expectedDx} onValueChange={setExpectedDx}>
                    <SelectTrigger data-testid="select-expected-dx"><SelectValue placeholder="Select diagnosis…" /></SelectTrigger>
                    <SelectContent>{template.commonDiagnoses.map((d) => <SelectItem key={d} value={d}>{d.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Input data-testid="input-expected-dx" value={expectedDx} onChange={(e) => setExpectedDx(e.target.value)} placeholder="e.g. pneumonia" />
                )}
              </div>
              <div>
                <Label>Expected Disposition <span className="text-red-500">*</span></Label>
                <Select value={expectedDisp} onValueChange={setExpectedDisp}>
                  <SelectTrigger data-testid="select-expected-disp"><SelectValue placeholder="Select disposition…" /></SelectTrigger>
                  <SelectContent>{(template?.expectedDispositions ?? DISPOSITIONS).map((d) => <SelectItem key={d} value={d}>{d.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tags (comma-separated)</Label>
                <Input data-testid="input-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="smoking, elderly, high-risk" />
              </div>
            </div>
            <div>
              <Label>Clinical Notes</Label>
              <Textarea data-testid="input-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Clinical rationale for this golden case…" rows={3} />
            </div>
            <Button data-testid="button-submit-golden-case" onClick={handleSubmit} disabled={createMutation.isPending} className="w-full gap-2">
              <CheckCircle className="h-4 w-4" />
              {createMutation.isPending ? 'Saving…' : 'Save Golden Case'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filter + List */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Filter:</span>
        <Select value={filterComplaint} onValueChange={setFilterComplaint}>
          <SelectTrigger data-testid="select-filter-complaint" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Complaints</SelectItem>
            {complaints.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <div className="text-center py-8 text-muted-foreground">Loading cases…</div>}

      <div className="space-y-3">
        {filteredCases.map((c) => (
          <Card key={c.id} data-testid={`card-golden-case-${c.id}`}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="capitalize">{c.complaint.replace(/_/g, ' ')}</Badge>
                    <span className="font-medium text-sm">{c.expectedDiagnosis.replace(/_/g, ' ')}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DISP_COLORS[c.expectedDisposition] ?? 'bg-gray-100'}`}>{c.expectedDisposition.replace(/_/g, ' ')}</span>
                    {(c.tags ?? []).map((t) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">By {c.createdBy} · {new Date(c.createdAt).toLocaleDateString()}</div>
                  {c.notes && <div className="text-xs text-muted-foreground mt-1 italic">{c.notes}</div>}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" data-testid={`button-expand-${c.id}`} onClick={() => setExpandedCase(expandedCase === c.id ? null : c.id)}>
                    {expandedCase === c.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="sm" data-testid={`button-delete-${c.id}`} onClick={() => deleteMutation.mutate(c.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
              {expandedCase === c.id && (
                <div className="mt-3 pt-3 border-t">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Clinical Answers</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                    {Object.entries(c.answers).map(([k, v]) => (
                      <div key={k} className="text-xs">
                        <span className="text-muted-foreground">{k.replace(/_/g, ' ')}: </span>
                        <span className="font-medium">{Array.isArray(v) ? v.join(', ') : String(v ?? '—')}</span>
                      </div>
                    ))}
                  </div>
                  {c.symptoms.length > 0 && (
                    <div className="mt-2 text-xs"><span className="text-muted-foreground">Symptoms: </span>{c.symptoms.join(', ')}</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {filteredCases.length === 0 && !isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            <FlaskConical className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No golden cases yet. Create the first one above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
