import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2, DatabaseZap, ExternalLink, Loader2, Search } from "lucide-react";

type Article = { pmid: string; title: string; abstract: string; journal: string };

export default function PubMedPanel() {
  const [query,    setQuery]    = useState("");
  const [articles, setArticles] = useState<Article[]>([]);
  const [ingested, setIngested] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const qc = useQueryClient();

  const searchMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/improvement/pubmed/search", { query }).then(r => r.json()),
    onSuccess: d => {
      setArticles(d.articles ?? []);
      if ((d.articles ?? []).length === 0) toast({ title: "No results", description: "Try a different query" });
    },
    onError: (e: any) => toast({ title: "Search failed", description: e.message, variant: "destructive" }),
  });

  const ingestMut = useMutation({
    mutationFn: (article: Article) =>
      apiRequest("POST", "/api/improvement/pubmed/ingest", article).then(r => r.json()),
    onSuccess: (d, article) => {
      setIngested(prev => new Set([...prev, article.pmid]));
      qc.invalidateQueries({ queryKey: ["/api/improvement/guidelines"] });
      qc.invalidateQueries({ queryKey: ["/api/improvement/recommendations"] });
      qc.invalidateQueries({ queryKey: ["/api/improvement/stats"] });
      toast({ title: "PubMed Article Ingested", description: `${d.rulesExtracted} rules extracted (PMID ${article.pmid})` });
    },
    onError: (e: any) => toast({ title: "Ingest failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <DatabaseZap size={13} className="text-green-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PubMed Auto-Ingestion</span>
      </div>

      {/* Search bar */}
      <div className="p-3 border-b flex gap-2">
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && query.trim() && searchMut.mutate()}
          placeholder="e.g. strep pharyngitis treatment guidelines 2024"
          className="h-7 text-xs flex-1"
          data-testid="input-pubmed-query"
        />
        <Button
          size="sm"
          className="h-7 text-xs gap-1.5 bg-green-600 hover:bg-green-700 flex-shrink-0"
          disabled={searchMut.isPending || !query.trim()}
          onClick={() => searchMut.mutate()}
          data-testid="button-pubmed-search"
        >
          {searchMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
          Search
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
            <Search size={28} className="opacity-20" />
            <div className="text-xs">Search PubMed for clinical evidence</div>
            <div className="text-[11px] opacity-60">Results are parsed into KB suggestions by GPT-4o</div>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {articles.map(a => {
              const isIngested = ingested.has(a.pmid);
              return (
                <Card key={a.pmid} className="p-3 border border-border/50">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold leading-snug line-clamp-2">{a.title || `PMID ${a.pmid}`}</div>
                      {a.journal && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">{a.journal}</div>
                      )}
                      {a.abstract && (
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-3 leading-relaxed">{a.abstract}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-[9px] h-3.5 px-1 font-mono border-muted-foreground/20 text-muted-foreground">
                          PMID {a.pmid}
                        </Badge>
                        <a
                          href={`https://pubmed.ncbi.nlm.nih.gov/${a.pmid}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-blue-400 flex items-center gap-0.5 hover:underline"
                        >
                          <ExternalLink size={9} /> View
                        </a>
                        <Button
                          size="sm"
                          variant="outline"
                          className={`ml-auto h-6 text-[10px] gap-1 ${isIngested ? "border-green-500/30 text-green-400" : "border-green-500/30 text-green-400 hover:bg-green-500/10"}`}
                          disabled={isIngested || ingestMut.isPending}
                          onClick={() => ingestMut.mutate(a)}
                          data-testid={`button-ingest-pubmed-${a.pmid}`}
                        >
                          {isIngested
                            ? <><CheckCircle2 size={9} /> Ingested</>
                            : ingestMut.isPending
                            ? <Loader2 size={9} className="animate-spin" />
                            : <><DatabaseZap size={9} /> Ingest</>}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
