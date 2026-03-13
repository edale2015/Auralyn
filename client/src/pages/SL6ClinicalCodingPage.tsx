import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SL6ClinicalCodingPage() {
  const [complaint, setComplaint] = useState("");
  const [disposition, setDisposition] = useState("");
  const [mapping, setMapping] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: complaintsData } = useQuery({ queryKey: ["/api/sl6/complaints"] });
  const { data: tableData, isLoading: tableLoading } = useQuery({ queryKey: ["/api/sl6/code-table"] });
  const { data: dispositionsData } = useQuery({
    queryKey: ["/api/sl6/dispositions", complaint],
    enabled: !!complaint,
  });

  const complaints: string[] = complaintsData?.complaints ?? [];
  const dispositions: string[] = dispositionsData?.dispositions ?? [];
  const table: any[] = tableData?.table ?? [];

  const mapMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sl6/map-codes", { complaint, disposition }),
    onSuccess: async (res: any) => {
      const json = await res.json();
      setMapping(json);
    },
    onError: () => {
      setMapping(null);
      toast({ title: "No mapping found for this combination", variant: "destructive" });
    },
  });

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Skill Layer 6 — Clinical Coding Engine</h1>
        <p className="text-slate-500 text-sm mt-1">Map complaints and dispositions to ICD-10 and CPT codes</p>
      </div>

      {/* Mapper */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-slate-800">Code Mapper</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Complaint</label>
            <Select value={complaint} onValueChange={v => { setComplaint(v); setDisposition(""); setMapping(null); }}>
              <SelectTrigger data-testid="select-coding-complaint"><SelectValue placeholder="Select complaint" /></SelectTrigger>
              <SelectContent>{complaints.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Disposition</label>
            <Select value={disposition} onValueChange={v => { setDisposition(v); setMapping(null); }} disabled={!complaint || dispositions.length === 0}>
              <SelectTrigger data-testid="select-coding-disposition"><SelectValue placeholder="Select disposition" /></SelectTrigger>
              <SelectContent>{dispositions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button data-testid="button-map-codes" className="w-full" onClick={() => mapMutation.mutate()} disabled={!complaint || !disposition || mapMutation.isPending}>
              {mapMutation.isPending ? "Mapping…" : "Get Codes"}
            </Button>
          </div>
        </div>

        {/* Result */}
        {mapping && (
          <div className="border rounded-xl p-4 bg-slate-50 space-y-4">
            <div className="text-xs text-slate-500 italic">{mapping.notes}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-700 mb-2">ICD-10 Codes</div>
                <div className="space-y-2">
                  {mapping.icd10?.map((c: any) => (
                    <div key={c.code} data-testid={`code-icd10-${c.code}`} className="flex items-center justify-between bg-white border rounded-lg px-3 py-2">
                      <div>
                        <div className="font-mono font-bold text-sm text-blue-700">{c.code}</div>
                        <div className="text-xs text-slate-500">{c.description}</div>
                      </div>
                      <button onClick={() => copyCode(c.code)} className="p-1 hover:text-blue-600 text-slate-400">
                        {copied === c.code ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-700 mb-2">CPT Codes</div>
                <div className="space-y-2">
                  {mapping.cpt?.map((c: any) => (
                    <div key={c.code} data-testid={`code-cpt-${c.code}`} className="flex items-center justify-between bg-white border rounded-lg px-3 py-2">
                      <div>
                        <div className="font-mono font-bold text-sm text-purple-700">{c.code}</div>
                        <div className="text-xs text-slate-500">{c.description}</div>
                        <div className="text-xs text-slate-400">{c.rvu} RVU</div>
                      </div>
                      <button onClick={() => copyCode(c.code)} className="p-1 hover:text-purple-600 text-slate-400">
                        {copied === c.code ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Full code table */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50 flex items-center justify-between">
          <span className="font-semibold text-slate-700 text-sm">Complete Code Reference Table</span>
          <span className="text-xs text-slate-400">{table.length} mappings</span>
        </div>
        {tableLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Complaint</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Disposition</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">ICD-10</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">CPT</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row: any, i: number) => (
                  <tr key={i} data-testid={`row-code-${i}`} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{row.complaint}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className="text-xs">{row.disposition}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {row.icd10?.map((c: any) => (
                          <span key={c.code} className="font-mono text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{c.code}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {row.cpt?.map((c: any) => (
                          <span key={c.code} className="font-mono text-xs text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">{c.code}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
