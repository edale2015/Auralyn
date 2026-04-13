/**
 * triggerOptimizer.ts — Skill trigger description optimizer
 *
 * Article 29 (Skill Evals — Improve mode):
 *   "I saw this firsthand with a compliance-check skill for PR reviews. It worked
 *    perfectly when someone typed 'use the PR checklist skill'. But in daily
 *    usage, nobody types that. Engineers just paste a PR link and say 'review
 *    this'. The skill never triggered because the frontmatter description said
 *    'PR compliance checklist' and Claude didn't connect that to 'review this PR'."
 *
 * "The Improve mode fixes this. It splits your test queries 60/40 into training
 *  and holdout, runs each query 3 times for a reliable trigger rate, proposes
 *  description improvements based on failures and re-evaluates up to 5 iterations."
 *
 * "Anthropic ran this on their own document-creation skills and saw improved
 *  trigger accuracy on 5 out of 6."
 *
 * Article 28a (Trigger Optimizer):
 *   "optimizeTriggerDescription(skillName, queries, executor) — if successRate < 0.7
 *    → recommend expanding trigger description."
 *
 * Key insight:
 *   "A skill that works perfectly but never fires is the same as a skill that
 *    doesn't exist."
 *
 * Clinical translation:
 *   The sepsis protocol skill description says "Executes Hour-1 bundle for sepsis."
 *   But nurses say "patient looks really sick" or "BP is tanking" — not "sepsis."
 *   The trigger optimizer finds that gap and fixes the description automatically.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type TriggerResult = "triggered" | "missed";

export interface QueryTestResult {
  query:       string;
  runs:        TriggerResult[];  // 3 runs per query for reliable rate
  triggerRate: number;           // 0-1
}

export interface OptimizationIteration {
  iteration:          number;
  description:        string;
  trainSuccessRate:   number;
  holdoutSuccessRate: number;
  queriesImproved:    number;
  recommendation?:    string;
}

export interface TriggerOptimizerResult {
  skillName:         string;
  initialDescription: string;
  finalDescription:   string;
  initialSuccessRate: number;
  finalSuccessRate:   number;
  iterations:         OptimizationIteration[];
  improved:           boolean;
  splitRatio:         { train: number; holdout: number };
}

// ── Default clinical trigger checker ─────────────────────────────────────────

function buildDefaultTriggerChecker(description: string): (query: string) => boolean {
  // Simulate Claude's skill matching: does the query conceptually match description?
  const descTerms = description.toLowerCase().split(/\W+/).filter((t) => t.length > 3);

  // Extended clinical synonym map
  const synonyms: Record<string, string[]> = {
    "sepsis":       ["septic", "infection", "bacteremia", "lactate", "blood culture", "sick", "really sick", "bp tanking", "not responding"],
    "triage":       ["prioritize", "sort patients", "who goes first", "acuity", "severity", "esi"],
    "medication":   ["drug", "meds", "order", "dose", "allergy", "pharmacy", "prescribe"],
    "review":       ["check", "evaluate", "examine", "assess", "look at", "audit", "inspect"],
    "report":       ["generate", "create", "produce", "output", "summary", "documentation"],
    "monitoring":   ["watch", "track", "follow", "observe", "vitals", "deteriorat"],
    "antibiotics":  ["antibiotic", "abx", "antimicrobial", "ceftriaxone", "vancomycin", "pip-tazo"],
    "admission":    ["admit", "admit to", "needs a bed", "hospital", "inpatient"],
    "critical":     ["icu", "critical care", "intensive care", "unstable", "crashing", "code"],
  };

  return (query: string): boolean => {
    const q = query.toLowerCase();
    // Direct term match
    if (descTerms.some((t) => q.includes(t))) return true;
    // Synonym match
    for (const [key, syns] of Object.entries(synonyms)) {
      if (descTerms.some((t) => t.includes(key) || key.includes(t))) {
        if (syns.some((s) => q.includes(s))) return true;
      }
    }
    return false;
  };
}

// ── Description improvement ───────────────────────────────────────────────────

function improveDescription(
  current:     string,
  missedQueries: string[],
): string {
  if (missedQueries.length === 0) return current;

  // Extract high-frequency terms from missed queries
  const termFreq: Record<string, number> = {};
  for (const q of missedQueries) {
    const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    for (const w of words) {
      termFreq[w] = (termFreq[w] ?? 0) + 1;
    }
  }

  const topTerms = Object.entries(termFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);

  if (topTerms.length === 0) return current;

  // Add "Use when" clause with discovered terms if not already there
  const hasUseWhen = /\buse when\b/i.test(current);
  if (hasUseWhen) {
    return `${current.trimEnd()} Also use when a patient is described as: ${topTerms.join(", ")}.`;
  } else {
    return `${current.trimEnd()} Use when ${topTerms.join(", ")} is mentioned or the patient presentation suggests this workflow.`;
  }
}

// ── optimizeTriggerDescription ────────────────────────────────────────────────

const MAX_ITERATIONS = 5;
const RUNS_PER_QUERY = 3;
const TRAIN_RATIO    = 0.6;

export async function optimizeTriggerDescription(
  skillName:    string,
  description:  string,
  queries:      string[],
  executor?:    (query: string) => Promise<boolean>,
): Promise<TriggerOptimizerResult> {
  if (queries.length < 2) {
    return {
      skillName,
      initialDescription:  description,
      finalDescription:    description,
      initialSuccessRate:  0,
      finalSuccessRate:    0,
      iterations:          [],
      improved:            false,
      splitRatio:          { train: TRAIN_RATIO, holdout: 1 - TRAIN_RATIO },
    };
  }

  // 60/40 train/holdout split
  const splitIdx    = Math.ceil(queries.length * TRAIN_RATIO);
  const trainSet    = queries.slice(0, splitIdx);
  const holdoutSet  = queries.slice(splitIdx);

  // Use provided executor or default trigger checker
  const check = executor
    ? executor
    : async (q: string) => buildDefaultTriggerChecker(description)(q);

  async function measureSuccessRate(desc: string, querySet: string[]): Promise<{ rate: number; missed: string[] }> {
    const checker = executor
      ? (q: string) => executor(q)
      : async (q: string) => buildDefaultTriggerChecker(desc)(q);

    let totalTriggers = 0;
    const missed: string[] = [];

    for (const q of querySet) {
      // 3 runs per query for reliable rate
      let queryTriggers = 0;
      for (let run = 0; run < RUNS_PER_QUERY; run++) {
        if (await checker(q)) queryTriggers++;
      }
      const triggerRate = queryTriggers / RUNS_PER_QUERY;
      totalTriggers += triggerRate;
      if (triggerRate < 0.5) missed.push(q);
    }

    return {
      rate:   querySet.length > 0 ? totalTriggers / querySet.length : 0,
      missed,
    };
  }

  const { rate: initialRate } = await measureSuccessRate(description, queries);

  if (initialRate >= 0.7) {
    return {
      skillName,
      initialDescription: description,
      finalDescription:   description,
      initialSuccessRate: initialRate,
      finalSuccessRate:   initialRate,
      iterations:         [],
      improved:           false,
      splitRatio:         { train: TRAIN_RATIO, holdout: 1 - TRAIN_RATIO },
    };
  }

  const iterations: OptimizationIteration[] = [];
  let currentDesc = description;

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    const { rate: trainRate, missed } = await measureSuccessRate(currentDesc, trainSet);
    const { rate: holdoutRate }       = await measureSuccessRate(currentDesc, holdoutSet);

    const newDesc = improveDescription(currentDesc, missed);
    const queriesImproved = missed.length;

    iterations.push({
      iteration:          i,
      description:        newDesc,
      trainSuccessRate:   Math.round(trainRate * 1000) / 1000,
      holdoutSuccessRate: Math.round(holdoutRate * 1000) / 1000,
      queriesImproved,
      recommendation:
        trainRate < 0.7
          ? `Expand trigger description to include common clinical phrasing: ${missed.slice(0, 3).join("; ")}`
          : "Trigger accuracy is acceptable.",
    });

    currentDesc = newDesc;

    const { rate: newTrainRate } = await measureSuccessRate(currentDesc, trainSet);
    if (newTrainRate >= 0.7) break;
  }

  const { rate: finalRate } = await measureSuccessRate(currentDesc, queries);

  return {
    skillName,
    initialDescription:  description,
    finalDescription:    currentDesc,
    initialSuccessRate:  Math.round(initialRate * 1000) / 1000,
    finalSuccessRate:    Math.round(finalRate * 1000) / 1000,
    iterations,
    improved:            finalRate > initialRate,
    splitRatio:          { train: TRAIN_RATIO, holdout: 1 - TRAIN_RATIO },
  };
}
