/**
 * ClinicalSkillsDashboard.tsx
 * client/src/pages/ClinicalSkillsDashboard.tsx
 *
 * Physician dashboard for reviewing and approving AI-generated Clinical Skills.
 * Shows pending skills (awaiting approval), active skills, and the spec tracker.
 *
 * Route: /clinical-skills
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Brain, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, BookOpen, TrendingUp,
} from "lucide-react";

interface ClinicalSkill {
  id: string; complaintSlug: string; title: string;
  trigger: string; aiTendency: string; correctReasoning: string;
  evidenceBasis: string; confidence: number; overrideCount: number;
  status: "pending_review" | "active" | "retired"; createdAt: string;
}

function SkillCard({ skill, onActivate, onRetire, isActing }: {
  skill:      ClinicalSkill;
  onActivate: (id: string) => void;
  onRetire:   (id: string) => void;
  isActing:   boolean;
}) {
  const isPending = skill.status === "pending_review";
  const isActive  = skill.status === "active";

  return (
    <Card
      className={`border ${isPending ? "border-amber-300 bg-amber-50/30 dark:bg-amber-950/20 dark:border-amber-700" : isActive ? "border-green-200 bg-green-50/20 dark:bg-green-950/10 dark:border-green-800" : "border-gray-200 dark:border-gray-700 opacity-60"}`}
      data-testid={`skill-card-${skill.id}`}
    >
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-100">{skill.title}</CardTitle>
              <Badge variant="outline" className="text-[10px]">{skill.complaintSlug.replace(/_/g, " ")}</Badge>
              {isPending && <Badge className="text-[10px] bg-amber-500 text-white">Pending Review</Badge>}
              {isActive  && <Badge className="text-[10px] bg-green-600 text-white">Active</Badge>}
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {skill.overrideCount} physician overrides · {Math.round(skill.confidence * 100)}% confidence
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3 space-y-2">
        <div className="space-y-1.5 text-xs text-gray-700 dark:text-gray-300">
          <div><span className="font-medium text-gray-600 dark:text-gray-400">When: </span>{skill.trigger}</div>
          <div><span className="font-medium text-red-600 dark:text-red-400">AI tends to: </span>{skill.aiTendency}</div>
          <div><span className="font-medium text-green-700 dark:text-green-400">Instead: </span>{skill.correctReasoning}</div>
          <div><span className="font-medium text-gray-500">Basis: </span>{skill.evidenceBasis}</div>
        </div>
        {isPending && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => onActivate(skill.id)}
              disabled={isActing}
              className="bg-green-600 hover:bg-green-700 text-white flex-1 h-7 text-xs"
              data-testid={`activate-skill-${skill.id}`}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />Activate Skill
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRetire(skill.id)}
              disabled={isActing}
              className="border-red-200 text-red-600 h-7 text-xs"
              data-testid={`reject-skill-${skill.id}`}
            >
              <XCircle className="h-3 w-3 mr-1" />Reject
            </Button>
          </div>
        )}
        {isActive && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onRetire(skill.id)}
            disabled={isActing}
            className="text-gray-400 h-6 text-[10px]"
            data-testid={`retire-skill-${skill.id}`}
          >
            Retire this skill
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function ClinicalSkillsDashboard() {
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey:        ["/api/clinical-skills"],
    queryFn:         () => apiRequest<{ skills: ClinicalSkill[] }>("GET", "/api/clinical-skills"),
    refetchInterval: 60_000,
  });

  const { data: specsData } = useQuery({
    queryKey: ["/api/harness/specs"],
    queryFn:  () => apiRequest<{ specs: any[] }>("GET", "/api/harness/specs"),
  });

  const activateMutation = useMutation({
    mutationFn: (skillId: string) =>
      apiRequest("POST", `/api/clinical-skills/${skillId}/activate`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/clinical-skills"] }),
  });

  const retireMutation = useMutation({
    mutationFn: (skillId: string) =>
      apiRequest("POST", `/api/clinical-skills/${skillId}/retire`, { reason: "Physician review" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/clinical-skills"] }),
  });

  const skills      = data?.skills ?? [];
  const pending     = skills.filter(s => s.status === "pending_review");
  const active      = skills.filter(s => s.status === "active");
  const specs       = specsData?.specs ?? [];
  const activeSpecs = specs.filter(s => s.status === "active" || s.status === "draft");
  const isActing    = activateMutation.isPending || retireMutation.isPending;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              Clinical Skills
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              AI-generated playbooks from physician override patterns · Review and activate
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            data-testid="button-refresh-skills"
          >
            <RefreshCw className="h-3.5 w-3.5" />Refresh
          </button>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Pending Review", count: pending.length,     color: "text-amber-600", bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-700" },
            { label: "Active Skills",  count: active.length,      color: "text-green-600", bg: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-700" },
            { label: "Active Specs",   count: activeSpecs.length, color: "text-blue-600",  bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-700"   },
          ].map(({ label, count, color, bg }) => (
            <div key={label} className={`border rounded p-2 text-center ${bg}`} data-testid={`stat-${label.toLowerCase().replace(/ /g, "-")}`}>
              <div className={`text-xl font-bold ${color}`}>{count}</div>
              <div className="text-[10px] text-gray-500">{label}</div>
            </div>
          ))}
        </div>

        {/* Pending skills — physician action required */}
        {pending.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                Awaiting Your Review ({pending.length})
              </h2>
            </div>
            <div className="space-y-2">
              {pending.map(s => (
                <SkillCard key={s.id} skill={s}
                  onActivate={id => activateMutation.mutate(id)}
                  onRetire={id => retireMutation.mutate(id)}
                  isActing={isActing} />
              ))}
            </div>
          </section>
        )}

        {/* Active skills */}
        {active.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <h2 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                Active Skills — Injected into AI ({active.length})
              </h2>
            </div>
            <div className="space-y-2">
              {active.map(s => (
                <SkillCard key={s.id} skill={s}
                  onActivate={id => activateMutation.mutate(id)}
                  onRetire={id => retireMutation.mutate(id)}
                  isActing={isActing} />
              ))}
            </div>
          </section>
        )}

        {/* Active specs */}
        {activeSpecs.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-4 w-4 text-blue-500" />
              <h2 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                Active Development Specs ({activeSpecs.length})
              </h2>
            </div>
            <div className="space-y-2">
              {activeSpecs.map(spec => {
                const done    = spec.tasks?.filter((t: any) => t.status === "complete").length ?? 0;
                const total   = spec.tasks?.length ?? 0;
                const blocked = spec.tasks?.filter((t: any) => t.status === "blocked").length ?? 0;
                return (
                  <Card key={spec.specId} className="border border-blue-200 dark:border-blue-800" data-testid={`spec-card-${spec.specId}`}>
                    <CardContent className="py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 flex-1">{spec.goal}</p>
                        <Badge variant="outline" className="text-[10px]">{spec.status}</Badge>
                      </div>
                      <p className="text-xs text-gray-500">{spec.mandate}</p>
                      <div className="flex items-center gap-3 text-[10px] text-gray-500">
                        <span>{done}/{total} tasks complete</span>
                        {blocked > 0 && <span className="text-red-600">⚠ {blocked} blocked</span>}
                        <span>v{spec.version}</span>
                      </div>
                      <div className="h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {!isLoading && skills.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center">
              <Brain className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No clinical skills generated yet.</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                Skills are auto-generated nightly from physician override patterns.
                The nudge runs at 3am UTC to extract patterns from the last 30 days.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
