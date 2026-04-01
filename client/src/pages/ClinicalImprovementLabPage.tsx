import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import AdminLayout from "@/components/AdminLayout";
import GuidelineIngestPanel from "@/components/improvement/GuidelineIngestPanel";
import PubMedPanel from "@/components/improvement/PubMedPanel";
import GuidelineComparePanel from "@/components/improvement/GuidelineComparePanel";
import PeerReviewPanel from "@/components/improvement/PeerReviewPanel";
import EvidenceScorePanel from "@/components/improvement/EvidenceScorePanel";
import {
  Activity, BarChart2, BookOpen, DatabaseZap, FileText,
  FlaskConical, GitCompare, Sparkles, TrendingUp, UserCheck,
} from "lucide-react";

type LabStats = {
  ok: boolean;
  guidelines: number;
  recommendations: number;
  approved: number;
  pending: number;
  peerReviews: number;
  pubmedArticles: number;
};

const FLOW_STEPS = [
  { icon: BookOpen,    label: "Ingest",   desc: "Paste guideline or fetch PubMed article" },
  { icon: Sparkles,    label: "Extract",  desc: "GPT-4o extracts clinical rules" },
  { icon: GitCompare,  label: "Compare",  desc: "System gaps identified vs current KB" },
  { icon: UserCheck,   label: "Review",   desc: "Physician approves, rejects, or modifies" },
  { icon: Activity,    label: "Deploy",   desc: "Approved rules queued to KB change log" },
];

export default function ClinicalImprovementLabPage() {
  const statsQ = useQuery<LabStats>({
    queryKey: ["/api/improvement/stats"],
    refetchInterval: 10_000,
  });

  const stats = statsQ.data;

  const statCards = [
    { label: "Guidelines",    value: stats?.guidelines ?? 0,      icon: FileText,     color: "text-blue-400"   },
    { label: "Extracted",     value: stats?.recommendations ?? 0, icon: Sparkles,     color: "text-cyan-400"   },
    { label: "Pending Review",value: stats?.pending ?? 0,         icon: UserCheck,    color: "text-yellow-400" },
    { label: "Approved",      value: stats?.approved ?? 0,        icon: TrendingUp,   color: "text-green-400"  },
    { label: "PubMed Fetched",value: stats?.pubmedArticles ?? 0,  icon: DatabaseZap,  color: "text-purple-400" },
    { label: "Peer Reviews",  value: stats?.peerReviews ?? 0,     icon: BarChart2,    color: "text-orange-400" },
  ];

  return (
    <AdminLayout>
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b bg-card flex items-center gap-3 flex-shrink-0">
          <FlaskConical size={18} className="text-violet-400" />
          <div>
            <h1 className="text-base font-bold leading-tight" data-testid="heading-improvement-lab">Clinical Improvement Lab</h1>
            <p className="text-xs text-muted-foreground">Evidence-driven KB evolution — ingest guidelines, detect gaps, approve safely</p>
          </div>
          <Badge variant="outline" className="ml-auto text-[10px] border-violet-500/30 text-violet-400 bg-violet-500/10 hidden sm:flex">
            Self-Improving System
          </Badge>
        </div>

        {/* Evidence flow pipeline */}
        <div className="px-4 py-2.5 border-b bg-muted/10 flex-shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {FLOW_STEPS.map((step, i) => (
              <div key={step.label} className="flex items-center gap-1 flex-shrink-0">
                <div className="flex flex-col items-center gap-0.5 px-2 py-1 rounded bg-muted/40 min-w-[70px]">
                  <step.icon size={12} className="text-muted-foreground" />
                  <span className="text-[10px] font-semibold text-muted-foreground">{step.label}</span>
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <div className="text-muted-foreground/40 text-xs">→</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div className="px-4 py-2 border-b flex-shrink-0">
          <div className="grid grid-cols-6 gap-2">
            {statCards.map(s => (
              <Card key={s.label} className="p-2 border border-border/40 text-center" data-testid={`stat-${s.label.toLowerCase().replace(/\s/g, "-")}`}>
                {statsQ.isLoading
                  ? <Skeleton className="h-6 w-10 mx-auto mb-1 rounded" />
                  : <div className={`text-xl font-black tabular-nums ${s.color}`}>{s.value}</div>}
                <div className="text-[10px] text-muted-foreground leading-tight">{s.label}</div>
              </Card>
            ))}
          </div>
        </div>

        {/* Main 3-column layout */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left: Guideline Ingest */}
          <div className="w-[300px] flex-shrink-0 border-r flex flex-col overflow-hidden">
            <GuidelineIngestPanel />
          </div>

          {/* Middle: tabbed panels */}
          <div className="flex-1 flex flex-col overflow-hidden border-r min-w-0">
            <Tabs defaultValue="pubmed" className="flex flex-col h-full">
              <TabsList className="flex-shrink-0 h-8 rounded-none border-b bg-muted/20 justify-start gap-0 p-0">
                <TabsTrigger
                  value="pubmed"
                  className="h-8 rounded-none text-[11px] px-4 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent gap-1.5"
                  data-testid="tab-pubmed"
                >
                  <DatabaseZap size={12} /> PubMed
                </TabsTrigger>
                <TabsTrigger
                  value="compare"
                  className="h-8 rounded-none text-[11px] px-4 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent gap-1.5"
                  data-testid="tab-compare"
                >
                  <GitCompare size={12} /> Gap Analysis
                </TabsTrigger>
                <TabsTrigger
                  value="evidence"
                  className="h-8 rounded-none text-[11px] px-4 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent gap-1.5"
                  data-testid="tab-evidence"
                >
                  <BarChart2 size={12} /> Evidence Scores
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pubmed" className="flex-1 mt-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                <PubMedPanel />
              </TabsContent>
              <TabsContent value="compare" className="flex-1 mt-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                <GuidelineComparePanel />
              </TabsContent>
              <TabsContent value="evidence" className="flex-1 mt-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                <ScrollArea className="flex-1">
                  <EvidenceScorePanel />
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right: Peer Review */}
          <div className="w-[340px] flex-shrink-0 flex flex-col overflow-hidden">
            <PeerReviewPanel />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
