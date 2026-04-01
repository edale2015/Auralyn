import { useState } from "react";
import { Link } from "wouter";
import AdminLayout from "@/components/AdminLayout";
import SystemExplorer from "@/components/qa/SystemExplorer";
import TreeAuditPanel from "@/components/qa/TreeAuditPanel";
import SuggestionPanel from "@/components/qa/SuggestionPanel";
import ConsistencyMatrix from "@/components/qa/ConsistencyMatrix";
import MedicationReview from "@/components/qa/MedicationReview";
import AuditInsights from "@/components/qa/AuditInsights";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Activity,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  FlaskConical,
  Grid3X3,
  Layers,
  Pill,
  Search,
  Shuffle,
  Sparkles,
} from "lucide-react";

const RELATED_DASHBOARDS = [
  { href: "/clinical-improvement-lab", label: "Clinical Improvement Lab", icon: FlaskConical, desc: "Evidence ingestion · Gap analysis · Calibration · FDA report", color: "border-violet-500/30 text-violet-400 hover:bg-violet-500/10" },
  { href: "/care-pathway-optimizer", label: "Care Pathway Optimizer", icon: Shuffle, desc: "A/B pathway experiments · Simulation engine · Auto-suggestions", color: "border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10" },
];

type ActivePanel = "tree" | "suggestion" | "consistency" | "medications" | "audit";

const PANELS: Array<{ id: ActivePanel; label: string; icon: any; color: string; badgeColor: string }> = [
  { id: "tree",        label: "Gap Audit",     icon: Search,       color: "text-yellow-400", badgeColor: "border-yellow-500/30 text-yellow-400 bg-yellow-500/10" },
  { id: "suggestion",  label: "AI Suggestions",icon: Sparkles,     color: "text-purple-400", badgeColor: "border-purple-500/30 text-purple-400 bg-purple-500/10" },
  { id: "consistency", label: "Consistency",   icon: Grid3X3,      color: "text-cyan-400",   badgeColor: "border-cyan-500/30 text-cyan-400 bg-cyan-500/10" },
  { id: "medications", label: "Medications",   icon: Pill,         color: "text-green-400",  badgeColor: "border-green-500/30 text-green-400 bg-green-500/10" },
  { id: "audit",       label: "Audit Intel",   icon: BookOpen,     color: "text-orange-400", badgeColor: "border-orange-500/30 text-orange-400 bg-orange-500/10" },
];

export default function ClinicalQAPage() {
  const [selectedSystem,    setSelectedSystem]    = useState<string | null>(null);
  const [selectedComplaint, setSelectedComplaint] = useState<string | null>(null);
  const [activePanel,       setActivePanel]       = useState<ActivePanel>("tree");

  const active = PANELS.find(p => p.id === activePanel)!;
  const ActiveIcon = active.icon;

  return (
    <AdminLayout title="Clinical QA">
      <div className="flex flex-col h-full min-h-0">

        {/* Page header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0">
          <div className="p-1.5 rounded bg-violet-600/20 border border-violet-500/30">
            <FlaskConical size={18} className="text-violet-400" />
          </div>
          <div>
            <h1 className="font-bold text-lg">Clinical QA Dashboard</h1>
            <p className="text-xs text-muted-foreground">KB quality assurance · gap detection · AI suggestions · audit intelligence</p>
          </div>
          <div className="ml-auto flex gap-2 flex-wrap">
            {[
              { icon: Layers,       label: "System Explorer" },
              { icon: Search,       label: "Gap Audit" },
              { icon: Sparkles,     label: "AI Suggestions" },
              { icon: Grid3X3,      label: "Consistency Matrix" },
              { icon: Pill,         label: "Medication Review" },
              { icon: Activity,     label: "Audit Intelligence" },
            ].map(b => (
              <Badge key={b.label} variant="outline" className="text-[10px] gap-1 text-muted-foreground border-muted-foreground/20">
                <b.icon size={10} /> {b.label}
              </Badge>
            ))}
          </div>
        </div>

        {/* Related dashboards callout */}
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/10 flex-shrink-0 flex-wrap" data-testid="related-dashboards-bar">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mr-1">Next steps →</span>
          {RELATED_DASHBOARDS.map(d => (
            <Link key={d.href} href={d.href}>
              <Button size="sm" variant="outline" className={cn("h-7 text-xs gap-1.5", d.color)} data-testid={`link-${d.href.slice(1)}`}>
                <d.icon size={11} /> {d.label}
                <span className="hidden sm:inline text-[10px] opacity-60 ml-1">— {d.desc}</span>
                <ArrowRight size={10} className="ml-auto opacity-40" />
              </Button>
            </Link>
          ))}
        </div>

        {/* 3-column layout */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* LEFT: System + Complaint Explorer (Panel 1) */}
          <div className="w-[260px] flex-shrink-0 border-r flex flex-col" data-testid="panel-system-explorer">
            <SystemExplorer
              selectedSystem={selectedSystem}
              selectedComplaint={selectedComplaint}
              onSelectSystem={s => { setSelectedSystem(s); setSelectedComplaint(null); }}
              onSelectComplaint={c => setSelectedComplaint(c)}
            />
          </div>

          {/* MIDDLE: Tab switcher for panels 2 / 4 / 5 */}
          <div className="flex-1 flex flex-col min-w-0 border-r">
            {/* Tab bar */}
            <div className="flex border-b bg-muted/20 flex-shrink-0 overflow-x-auto">
              {PANELS.filter(p => ["tree", "consistency", "medications"].includes(p.id)).map(p => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    data-testid={`tab-${p.id}`}
                    onClick={() => setActivePanel(p.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap flex-shrink-0",
                      activePanel === p.id
                        ? `border-primary ${p.color}`
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon size={12} /> {p.label}
                  </button>
                );
              })}
            </div>

            {/* Middle panel content */}
            <div className="flex-1 overflow-hidden">
              {activePanel === "tree"        && <TreeAuditPanel selectedSystem={selectedSystem} selectedComplaint={selectedComplaint} />}
              {activePanel === "consistency" && <ConsistencyMatrix />}
              {activePanel === "medications" && <MedicationReview />}
              {/* Fallback to tree if somehow a right-pane panel is selected here */}
              {!["tree", "consistency", "medications"].includes(activePanel) && (
                <TreeAuditPanel selectedSystem={selectedSystem} selectedComplaint={selectedComplaint} />
              )}
            </div>
          </div>

          {/* RIGHT: AI Suggestions (Panel 3) + Audit Intelligence (Panel 6) */}
          <div className="w-[320px] flex-shrink-0 flex flex-col">
            {/* Tab bar */}
            <div className="flex border-b bg-muted/20 flex-shrink-0">
              {PANELS.filter(p => ["suggestion", "audit"].includes(p.id)).map(p => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    data-testid={`tab-${p.id}`}
                    onClick={() => setActivePanel(p.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors",
                      activePanel === p.id
                        ? `border-primary ${p.color}`
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon size={12} /> {p.label}
                  </button>
                );
              })}
            </div>

            {/* Right panel content */}
            <div className="flex-1 overflow-hidden">
              {activePanel === "suggestion" && <SuggestionPanel selectedComplaint={selectedComplaint} selectedSystem={selectedSystem} />}
              {activePanel === "audit"      && <AuditInsights />}
              {!["suggestion", "audit"].includes(activePanel) && (
                <div className="h-full flex flex-col">
                  {/* Show both panels stacked when middle tab is active */}
                  <div className="flex-1 border-b overflow-hidden">
                    <SuggestionPanel selectedComplaint={selectedComplaint} selectedSystem={selectedSystem} />
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </AdminLayout>
  );
}
