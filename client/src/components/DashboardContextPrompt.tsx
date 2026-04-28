/**
 * DashboardContextPrompt.tsx
 * client/src/components/DashboardContextPrompt.tsx
 *
 * Transforms every dashboard from a static data wall into an
 * agent-initiated conversation. Sits at the top of each clinical
 * dashboard page and surfaces the most important insight as a
 * pre-filled command interface prompt.
 *
 * The physician sees one clear sentence about what matters right now,
 * with a single button to ask the agent about it. No navigation required.
 *
 * Usage:
 *   <DashboardContextPrompt context="followup" data={{ escalated: 3, active: 12, completed: 8 }} />
 *   <DashboardContextPrompt context="queue"     data={{ urgent: 4, async: 11, total: 23 }} />
 *   <DashboardContextPrompt context="performance" data={{ grade: "B", overrideRate: 0.22, totalCases: 47 }} />
 *   <DashboardContextPrompt context="telemed"   data={{ active: 2, pendingDrafts: 2 }} />
 */

import { useState, useEffect } from "react";
import { Badge }  from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Terminal,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type DashboardContext = "followup" | "queue" | "performance" | "telemed" | "cds" | "custom";

interface DashboardContextPromptProps {
  context:        DashboardContext;
  data?:          Record<string, any>;
  customInsight?: string;
  customCommand?: string;
}

interface Insight {
  text:     string;
  command:  string;
  severity: "alert" | "ok" | "info";
}

// ─── Insight generators ───────────────────────────────────────────────────────

function generateInsight(context: DashboardContext, data: Record<string, any>): Insight {
  switch (context) {

    case "followup": {
      const escalated = data.escalated ?? 0;
      const active    = data.active    ?? 0;
      if (escalated > 0) {
        return {
          text:     `${escalated} patient${escalated !== 1 ? "s" : ""} triggered a deterioration alert and need your attention now.`,
          command:  "show me escalated follow-up patients and what happened",
          severity: "alert",
        };
      }
      if (active === 0) {
        return {
          text:     "No patients are currently enrolled in follow-up protocols.",
          command:  "how do I enroll patients in chronic disease follow-up",
          severity: "info",
        };
      }
      return {
        text:     `${active} patient${active !== 1 ? "s" : ""} in active follow-up — all responding normally.`,
        command:  "summarize my follow-up patients this week",
        severity: "ok",
      };
    }

    case "queue": {
      const urgent = data.urgent ?? 0;
      const async_ = data.async  ?? 0;
      const total  = data.total  ?? 0;
      if (urgent > 0) {
        return {
          text:     `${urgent} urgent case${urgent !== 1 ? "s" : ""} waiting for review — these need synchronous attention.`,
          command:  "show me all urgent cases waiting for review",
          severity: "alert",
        };
      }
      if (async_ > 0) {
        return {
          text:     `${async_} low-acuity case${async_ !== 1 ? "s" : ""} are safe for async batch review — clear them quickly.`,
          command:  "show async safe cases I can batch review now",
          severity: "info",
        };
      }
      return {
        text:     total > 0
          ? `${total} case${total !== 1 ? "s" : ""} in the queue — no urgent flags.`
          : "Review queue is clear.",
        command:  "show me the review queue",
        severity: total > 0 ? "info" : "ok",
      };
    }

    case "performance": {
      const grade        = data.grade        ?? "—";
      const overrideRate = data.overrideRate ?? 0;
      const totalCases   = data.totalCases   ?? 0;
      if (grade === "D" || grade === "F") {
        return {
          text:     `Your performance grade is ${grade} — below national benchmarks in one or more areas.`,
          command:  "explain my performance grade and what I can improve",
          severity: "alert",
        };
      }
      if (overrideRate > 0.3) {
        return {
          text:     `Your AI override rate is ${Math.round(overrideRate * 100)}% — higher than your recent baseline. Worth reviewing.`,
          command:  "why is my AI override rate high this week",
          severity: "info",
        };
      }
      return {
        text:     totalCases > 0
          ? `Grade ${grade} — ${totalCases} cases reviewed. Performing at or above national benchmarks.`
          : "No cases reviewed in the last 30 days yet.",
        command:  "how am I doing this week compared to national benchmarks",
        severity: "ok",
      };
    }

    case "telemed": {
      const active        = data.active        ?? 0;
      const pendingDrafts = data.pendingDrafts  ?? 0;
      if (pendingDrafts > 0) {
        return {
          text:     `${pendingDrafts} AI draft repl${pendingDrafts !== 1 ? "ies are" : "y is"} waiting for your approval before being sent to patients.`,
          command:  "show active telemedicine sessions with pending draft replies",
          severity: "alert",
        };
      }
      if (active > 0) {
        return {
          text:     `${active} active telemedicine session${active !== 1 ? "s" : ""} in progress.`,
          command:  "show me active telemedicine sessions",
          severity: "info",
        };
      }
      return {
        text:     "No active telemedicine sessions right now.",
        command:  "show me recent telemedicine sessions",
        severity: "ok",
      };
    }

    case "custom":
    default:
      return {
        text:     "What do you need from this data?",
        command:  "",
        severity: "info",
      };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardContextPrompt({
  context,
  data = {},
  customInsight,
  customCommand,
}: DashboardContextPromptProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const insight = customInsight
    ? { text: customInsight, command: customCommand ?? "", severity: "info" as const }
    : generateInsight(context, data);

  const openCommand = () => {
    window.dispatchEvent(
      new CustomEvent("auralyn:open-command", {
        detail: { prefill: insight.command },
      })
    );
  };

  const severityStyles = {
    alert: {
      border: "border-red-200 bg-red-50/60",
      icon:   <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />,
      badge:  "bg-red-100 text-red-700 border-red-300",
      button: "bg-red-600 hover:bg-red-700 text-white",
      label:  "Action needed",
    },
    ok: {
      border: "border-green-200 bg-green-50/60",
      icon:   <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />,
      badge:  "bg-green-100 text-green-700 border-green-300",
      button: "bg-green-600 hover:bg-green-700 text-white",
      label:  "All clear",
    },
    info: {
      border: "border-blue-200 bg-blue-50/60",
      icon:   <Sparkles className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />,
      badge:  "bg-blue-100 text-blue-700 border-blue-300",
      button: "bg-blue-600 hover:bg-blue-700 text-white",
      label:  "Insight",
    },
  };

  const styles = severityStyles[insight.severity];

  return (
    <div
      className={`
        border rounded-xl px-4 py-3 flex items-start gap-3
        transition-all duration-300
        ${styles.border}
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}
      `}
      data-testid="dashboard-context-prompt"
    >
      {styles.icon}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${styles.badge}`}
          >
            {styles.label}
          </Badge>
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <Terminal className="h-2.5 w-2.5" />
            Auralyn AI
          </span>
        </div>
        <p className="text-sm text-gray-700 leading-snug">
          {insight.text}
        </p>
      </div>

      {insight.command && (
        <Button
          size="sm"
          onClick={openCommand}
          className={`shrink-0 h-8 text-xs px-3 ${styles.button}`}
          data-testid="btn-ask-agent"
        >
          Ask agent
          <ArrowRight className="h-3 w-3 ml-1.5" />
        </Button>
      )}
    </div>
  );
}
