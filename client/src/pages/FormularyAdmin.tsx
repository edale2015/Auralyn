import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Pill } from "lucide-react";

type Entry = { medicationId: string; name: string; category: string; tier: string; requiresPriorAuth: boolean; restrictions?: string[] };

export default function FormularyAdmin() {
  const { authFetch } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const url = search ? `/api/formulary?q=${encodeURIComponent(search)}` : "/api/formulary";
        const res = await authFetch(url);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setEntries(json.entries || []);
      } catch (err: any) { setError(err?.message ?? "Error"); }
      finally { setLoading(false); }
    })();
  }, [search]);

  const tierColor = (t: string) => t === "preferred" ? "default" : t === "restricted" ? "destructive" : "secondary";

  return (
    <div className="p-6 space-y-4" data-testid="page-formulary">
      <div className="flex items-center gap-3"><Pill className="h-5 w-5" /><h2 className="text-xl font-semibold">Formulary Admin</h2></div>
      <Input placeholder="Search medications..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" data-testid="input-search" />
      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}
      {loading ? <div className="flex justify-center py-12" data-testid="status-loading"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Formulary</CardTitle></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>Medication</TableHead><TableHead>Category</TableHead><TableHead>Tier</TableHead><TableHead>Prior Auth</TableHead></TableRow></TableHeader>
            <TableBody>{entries.map((e) => (
              <TableRow key={e.medicationId} data-testid={`formulary-row-${e.medicationId}`}>
                <TableCell className="text-sm font-medium">{e.name}</TableCell>
                <TableCell className="text-xs">{e.category}</TableCell>
                <TableCell><Badge variant={tierColor(e.tier) as any} className="text-xs">{e.tier}</Badge></TableCell>
                <TableCell className="text-xs">{e.requiresPriorAuth ? "Yes" : "No"}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  );
}
