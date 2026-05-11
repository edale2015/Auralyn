# AURALYN — Graphify + Caveman Quick Reference

## SETUP (one time each)

### Graphify
pip install graphifyy
graphify install          # connects to Claude Code

### Caveman
# Already configured — copy CLAUDE.md to your Auralyn project root
# Claude Code reads it automatically at session start

---

## WHEN TO RUN GRAPHIFY

You don't need to run it constantly. Run it when:

| Situation | Command |
|-----------|---------|
| First time setting up | /graphify . |
| After a big refactor | /graphify . |
| Debugging the clinical pipeline only | /graphify ./server/routes/clinical ./server/engines |
| Reviewing safety layer changes | /graphify ./server/safety ./server/agents |
| Billing/revenue work | /graphify ./server/routes/billing ./server/agents/BillingAgent.ts |
| KB and scoring changes | /graphify ./server/kb ./server/scoring ./shared/schema.ts |
| Frontend dashboard work | /graphify ./client/src/pages ./client/src/components |

Output lands in graphify-out/ — graph.html to explore, GRAPH_REPORT.md to feed Claude.

---

## CAVEMAN SUB-SKILLS — WHEN TO USE EACH

| Sub-skill | Use when... | Example trigger |
|-----------|-------------|-----------------|
| /caveman-clinical | Working on triage, scoring, KB, agents | "The CURB-65 output seems wrong" |
| /caveman-hipaa | HIPAA/FDA compliance questions | "Is this audit log approach Part 11 compliant?" |
| /caveman-agent | RLHF, agent registry, circuit breakers | "Why did the BillingAgent trip its circuit breaker?" |
| /caveman-debug | Tracking down a specific bug | "Getting a 500 on /api/triage/submit" |
| /caveman-pr | Reviewing a pull request | "Review this diff" |
| /caveman-commit | Writing a commit message | "Commit message for this fix" |

---

## COMBINED WORKFLOW — REAL EXAMPLES

### Example 1: "Something is wrong with sepsis detection"
1. /graphify ./server/safety ./server/scoring ./server/kb
2. /caveman-clinical
3. Ask: "Trace how a sepsis presentation flows from intake through red flag detection to disposition"
   → Claude navigates the graph instead of reading 40 files
   → Answer comes back in 5 lines, not 5 paragraphs

### Example 2: "Add a new complaint pack for pediatric fever"
1. /graphify ./server/kb ./server/routes/clinical ./shared/schema.ts
2. /caveman-clinical
3. Ask: "What files do I need to touch to add a new complaint pack?"
   → Graph shows exact dependency chain
   → Answer: file list + order of changes, no essay

### Example 3: "Is our audit log HIPAA compliant?"
1. No Graphify needed (compliance question, not codebase navigation)
2. /caveman-hipaa
3. Ask: "Review our audit log implementation for 21 CFR Part 11 gaps"
   → Answer: regulation → gap → fix → doc needed

### Example 4: Onboarding a new developer to Auralyn
1. /graphify . (full graph, 5-10 min)
2. Open graphify-out/graph.html — show them the visual map
3. /caveman full
4. Ask: "Walk me through the clinical pipeline from WhatsApp intake to physician review"
   → Graph-navigated answer, terse, precise

---

## IMPORTANT: WHAT THESE TOOLS DON'T FIX

Graphify maps your code. It doesn't fix bad architecture.
Caveman shortens answers. It doesn't fix wrong answers.

For Auralyn specifically:
- Graphify won't resolve your three-database consistency problem — that needs the outbox pattern
- Caveman won't make compliance gaps disappear — those need legal/regulatory work
- Both tools are for development efficiency, not for clinical safety validation

The golden case regression suite, PHI guard, and Supervisor Gate are your real safety tools.
Graphify and Caveman just help you work faster without burning through token budgets.
