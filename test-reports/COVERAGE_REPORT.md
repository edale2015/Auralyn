# Auralyn Complaint Coverage Report — T028 / V029 / V030

**Mode: TEST, not fix.** No KB data, question configs, or pipeline logic were
edited to make complaints pass. Findings below are reported as observed.

Generated against the running dev server on `localhost:5000`.
Harnesses: `server/tests/coverageSweep.ts`, `server/tests/turnByTurnRobustness.ts`.
Raw data: `test-reports/coverage-1025.csv`, `test-reports/robustness.txt`.

---

## Headline numbers

| Metric | Value |
| --- | --- |
| Master complaint count (`/diff-disposition/summary`) | **1024** (NOT 1025 — reported as actual) |
| Rows in coverage CSV | 1024 (reconciles exactly) |
| NO_DATA | **910** (88.9%) |
| PARTIAL | **114** (11.1%) |
| FULL | **0** |
| BROKEN | **0** |
| Lab-sweep live GPT calls | 114 (910 NO_DATA skipped the live run) |
| Lab-sweep est. GPT cost | ~$0.068 (gpt-4o-mini, ESTIMATE — endpoint exposes no token usage) |
| Lab-sweep wall-clock | ~290s total (25 smoke + 999 full) |

The four buckets sum to 1024. No complaint is uncounted.

---

## V029 — Lab-path coverage (engine + KB breadth)

This sweep runs the **lab** path (`POST /narrative-run`), which takes all inputs
at once. It proves engine + KB breadth. It does **not** prove the live
turn-by-turn chat works — that is V030.

### Totals per class

```
    910 NO_DATA
    114 PARTIAL
      0 FULL
      0 BROKEN
```

### NO_DATA breakdown (content gaps — not code bugs)

```
    461  dx_count=0 AND question_count=0
    372  question_count=0 (has differentials, no questions)
     77  dx_count=0 (has questions, no differentials)
```

Only **114 / 1024 (11%)** complaints have BOTH questions and differentials and
are therefore eligible to run the pipeline at all. The other 910 are content
gaps in `kb_master_rules`. `card_chest_pain` (0 questions) is one of them, as the
plan anticipated.

### PARTIAL breakdown — every one stalls at the same place

```
    114  last_stage = 9:diagnosis_ranking
    114  reason: differential produced, but NO genuine disposition
              (disposition defaulted to HOME_CARE)
```

All 114 runnable complaints produce a differential (diagnosis rules fire in
steps 2 and 9) but **none produce a rule-derived disposition**. See structural
finding #1 below — this is a pipeline bug, not a per-complaint data gap.

### BROKEN list

**Empty.** No complaint errored, threw, looped, or ER-jumped on the lab path.
(The lab engine cannot loop — it takes all answers at once — and a red-flag
escalation does not short-circuit it; the full pipeline still runs.)

### Cross-check

`FULL ⇒ dx_count>0 AND disposition_present=true`: **0 FULL rows, 0 violations.**
The classifier holds.

### Soft detection metric (does NOT affect classification)

101 / 114 runnable complaints had GPT's raw pass-1 detection ≠ the requested
complaint id. This is expected and is a soft metric only: the pass-1 prompt
enumerates ~15 canonical complaint ids, so specific variants (e.g.
`cardio_chest_pain`) are detected as the canonical parent (`chest_pain`) and then
fuzzy-resolved. Pipeline traversal — the hard metric — was always run against the
requested id via the `complaintId` hint.

---

## Structural findings (root causes behind 0 FULL) — report, do not fix

These are pipeline-level bugs surfaced by the sweep. Fixing them is a follow-up
plan, per the brief.

**Finding 1 — Disposition rules never fire (why FULL=0).**
`server/clinical/ruleExecutionEngine.ts:284`. The disposition step (step 10, with
`ruleType:"disposition"`) is filtered with
`if (pipeStep.step === 10) return r.rule_type === "medication" && ...`. Since the
candidate set was already filtered to `rule_type === "disposition"`, this branch
is always false, so **no disposition rule is ever evaluated**. `finalDisposition`
is therefore only ever set by a red-flag escalation, otherwise it defaults to the
hardcoded `"HOME_CARE"` (`:437`). Consequence: the disposition stage is
structurally dead for every non-escalated case. This is why all 114 runnable
complaints land in PARTIAL rather than FULL. (Lenient alternative: if the
`HOME_CARE` default were counted as "a disposition", all 114 would read FULL — but
that would falsely imply the disposition stage works, so they are reported as
PARTIAL.)

**Finding 2 — `summary.topDiagnoses` is always empty.**
`server/routes/complaintTestLab.routes.ts:21` (`extractTopDiagnoses`) reads
`step.firedRules`, but the engine emits the field as `rulesFired`
(`ruleExecutionEngine.ts:351`). So the API summary always returns
`topDiagnoses: []` even when 30–119 diagnosis rules fired. The harness works
around this by reading `pipelineResult.steps[].rulesFired` directly; any UI/caller
relying on `summary.topDiagnoses` shows no differential.

**Finding 3 — Master count is 1024, not 1025.** The summary query excludes
`complaint_id = 'ALL'`. Reported as the actual number per the brief.

---

## V030 — Live turn-by-turn robustness (the looping path)

**Separate path, separate result.** Driven via `POST /api/test/kb-sim` →
`handleWhatsAppKBIntake` (the real WhatsApp conversation engine), NOT
`/narrative-run`. One question asked/answered per turn. This is where the
looping/re-greeting bug actually lives, and **it reproduces broadly.**

- Sample: **17 complaints × 4 answer sets = 68 conversations.**
- Chest-pain family (required): `chest_pain`, `cardio_chest_pain`,
  `chest_pain_cardiac`, `card_chest_pain` — all included.
- Answer sets: `all_no`, `all_yes`, `mixed`, `nl_neg` (natural-language negatives:
  "nope", "not really", "none that I know of", "no I don't think so").
- NO_DATA complaints included to confirm graceful handling: `shoulder_pain`,
  `fever`, `back_pain`, `shortness_of_breath`, `card_chest_pain`, `headache`.

### Tally

```
conversations: 68   PASS: 20   FAIL: 48
FAIL breakdown:  REPEAT 19   RESET 21   STALL 8
```

(Counts shift a few between runs because the turn-6+ phase uses a live LLM and is
nondeterministic; the aggregate pattern is stable.)

### What PASSED (20)

- **All 16 chest-pain-family conversations** (4 complaints × 4 answer sets)
  complete cleanly at turn 24 via the deterministic scripted chest-pain intake —
  including `all_yes` (red flags present): a red-flag alert fires but the
  interview continues to completion, it does **not** ER-jump. This path is robust.
- 4 graceful no-reply stops (`headache` all_no/all_yes/mixed, `shortness_of_breath`
  all_no) — ended without looping.

### What FAILED (48) — three real bugs

1. **RESET / unrecognized complaint (21):** `back_pain`, `fever`, `skin_rash`,
   `palpitations`, `shoulder_pain` are not recognized by the conversational
   router. The bot returns the greeting *"Hi, I'm Auralyn… What's bringing you in
   today?"* on **every** turn — intake never starts; a live patient would be
   re-greeted forever. (`sore_throat × mixed` also re-greeted mid-conversation
   after the LLM phase.)
2. **REPEAT / scripted-question loop (19):** e.g. `cough` asks *"How long have you
   had the cough?"*, advances a few turns, then re-asks the same question;
   `sore_throat`, `abdominal_pain`, `dizziness`, `ear_pain`, `sinus_pressure`,
   `shortness_of_breath` all loop a question.
3. **STALL on natural-language negatives (8):** with answers like "none that I know
   of" / "no I don't think so", the engine stops parsing and emits *"Got it…"*
   repeatedly without advancing or terminating. Every `nl_neg` run on a recognized
   complaint stalled.

Full per-conversation PASS/FAIL with reasons: `test-reports/robustness.txt`.

### Scope reminder

The lab sweep (V029) being free of BROKEN does **not** mean the live chat works.
The live chat fails 48/68 in this sample. The two paths are independent and are
reported independently, as required.

---

## Files

- `server/tests/coverageSweep.ts` — T028/V029 harness (resumable, `--limit N`).
- `server/tests/turnByTurnRobustness.ts` — V030 harness.
- `test-reports/coverage-1025.csv` — 1024 rows, one per complaint.
- `test-reports/robustness.txt` — 68 conversation transcripts of record.

## Verification commands run (outputs pasted in the session)

```bash
npx tsx server/tests/coverageSweep.ts --limit 25     # smoke: 25 rows
npx tsx server/tests/coverageSweep.ts                # full: 1024 rows
npx tsx server/tests/turnByTurnRobustness.ts | tee test-reports/robustness.txt
# Final gate printed: COVERAGE REPORT COMPLETE  (rows=1024 master=1024 classified=1024)
```
