import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import AdminLayout from "@/components/AdminLayout";
import GuidelineIngestPanel from "@/components/improvement/GuidelineIngestPanel";
import PubMedPanel from "@/components/improvement/PubMedPanel";
import GuidelineComparePanel from "@/components/improvement/GuidelineComparePanel";
import PeerReviewPanel from "@/components/improvement/PeerReviewPanel";
import EvidenceScorePanel from "@/components/improvement/EvidenceScorePanel";
import EvidenceRankingTab from "@/components/improvement/EvidenceRankingTab";
import CalibrationTab from "@/components/improvement/CalibrationTab";
import OutcomesTab from "@/components/improvement/OutcomesTab";
import {
  Activity, Award, BarChart2, BookOpen, DatabaseZap, FileText,
  FlaskConical, GitCompare, ScrollText, Sigma, Sparkles, TrendingUp, UserCheck,
} from "lucide-react";

type LabStats = {
  ok: boolean;
  guidelines: number; recommendations: number; approved: number;
  pending: number; peerReviews: number; pubmedArticles: number;
};

const FLOW_STEPS = [
  { icon: BookOpen,   label: "Ingest",   desc: "Paste guideline or PubMed" },
  { icon: Sparkles,   label: "Extract",  desc: "GPT-4o extracts rules" },
  { icon: GitCompare, label: "Compare",  desc: "Gaps vs current KB" },
  { icon: UserCheck,  label: "Review",   desc: "Physician approves" },
  { icon: Activity,   label: "Deploy",   desc: "Rules queued to KB" },
];

export default function ClinicalImprovementLabPage() {
  const statsQ = useQuery<LabStats>({ queryKey: ["/api/improvement/stats"], refetchInterval: 10_000 });
  const stats = statsQ.data;

  const statCards = [
    { label: "Guidelines",     value: stats?.guidelines ?? 0,      icon: FileText,   color: "text-blue-400",   id: "stat-guidelines" },
    { label: "Extracted",      value: stats?.recommendations ?? 0, icon: Sparkles,   color: "text-cyan-400",   id: "stat-extracted" },
    { label: "Pending Review", value: stats?.pending ?? 0,         icon: UserCheck,  color: "text-yellow-400", id: "stat-pending-review" },
    { label: "Approved",       value: stats?.approved ?? 0,        icon: TrendingUp, color: "text-green-400",  id: "stat-approved" },
    { label: "PubMed Fetched", value: stats?.pubmedArticles ?? 0,  icon: DatabaseZap,color: "text-purple-400", id: "stat-pubmed-fetched" },
    { label: "Peer Reviews",   value: stats?.peerReviews ?? 0,     icon: BarChart2,  color: "text-orange-400", id: "stat-peer-reviews" },
  ];

  return (
    <AdminLayout>
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b bg-card flex items-center gap-3 flex-shrink-0">
          <FlaskConical size={18} className="text-violet-400" />
          <div>
            <h1 className="text-base font-bold leading-tight" data-testid="heading-improvement-lab">Clinical Improvement Lab</h1>
            <p className="text-xs text-muted-foreground">Evidence-driven KB evolution — ingest, compare, calibrate, review, deploy</p>
          </div>
          <Badge variant="outline" className="ml-auto text-[10px] border-violet-500/30 text-violet-400 bg-violet-500/10 hidden sm:flex">
            Self-Improving System
          </Badge>
        </div>

        {/* Pipeline flow */}
        <div className="px-4 py-2.5 border-b bg-muted/10 flex-shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto">
            {FLOW_STEPS.map((step, i) => (
              <div key={step.label} className="flex items-center gap-1 flex-shrink-0">
                <div className="flex flex-col items-center gap-0.5 px-2 py-1 rounded bg-muted/40 min-w-[70px]">
                  <step.icon size={12} className="text-muted-foreground" />
                  <span className="text-[10px] font-semibold text-muted-foreground">{step.label}</span>
                </div>
                {i < FLOW_STEPS.length - 1 && <div className="text-muted-foreground/40 text-xs">→</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div className="px-4 py-2 border-b flex-shrink-0">
          <div className="grid grid-cols-6 gap-2">
            {statCards.map(s => (
              <Card key={s.label} className="p-2 border border-border/40 text-center" data-testid={s.id}>
                {statsQ.isLoading ? <Skeleton className="h-6 w-10 mx-auto mb-1 rounded" /> : <div className={`text-xl font-black tabular-nums ${s.color}`}>{s.value}</div>}
                <div className="text-[10px] text-muted-foreground leading-tight">{s.label}</div>
              </Card>
            ))}
          </div>
        </div>

        {/* Main 3-column layout */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left: Guideline Ingest */}
          <div className="w-[280px] flex-shrink-0 border-r flex flex-col overflow-hidden">
            <GuidelineIngestPanel />
          </div>

          {/* Middle: tabbed panels (6 tabs) */}
          <div className="flex-1 flex flex-col overflow-hidden border-r min-w-0">
            <Tabs defaultValue="pubmed" className="flex flex-col h-full">
              <TabsList className="flex-shrink-0 h-8 rounded-none border-b bg-muted/20 justify-start gap-0 p-0 overflow-x-auto">
                {[
                  { value: "pubmed",    icon: DatabaseZap, label: "PubMed",         testId: "tab-pubmed" },
                  { value: "compare",   icon: GitCompare,  label: "Gap Analysis",   testId: "tab-compare" },
                  { value: "evidence",  icon: BarChart2,   label: "Evidence Scores",testId: "tab-evidence" },
                  { value: "ranking",   icon: Award,       label: "Evidence Rank",  testId: "tab-ranking" },
                  { value: "calibration",icon: Sigma,      label: "Calibration",    testId: "tab-calibration" },
                  { value: "outcomes",  icon: ScrollText,  label: "Outcomes & FDA", testId: "tab-outcomes" },
                ].map(t => (
                  <TabsTrigger key={t.value} value={t.value}
                    className="h-8 rounded-none text-[11px] px-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent gap-1.5 flex-shrink-0"
                    data-testid={t.testId}
                  >
                    <t.icon size={11} /> {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="pubmed"     className="flex-1 mt-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"><PubMedPanel /></TabsContent>
              <TabsContent value="compare"    className="flex-1 mt-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"><GuidelineComparePanel /></TabsContent>
              <TabsContent value="evidence"   className="flex-1 mt-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"><EvidenceScorePanel /></TabsContent>
              <TabsContent value="ranking"    className="flex-1 mt-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"><EvidenceRankingTab /></TabsContent>
              <TabsContent value="calibration"className="flex-1 mt-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"><CalibrationTab /></TabsContent>
              <TabsContent value="outcomes"   className="flex-1 mt-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"><OutcomesTab /></TabsContent>
            </Tabs>
          </div>

          {/* Right: Peer Review */}
          <div className="w-[320px] flex-shrink-0 flex flex-col overflow-hidden">
            <PeerReviewPanel />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
