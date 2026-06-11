# Auralyn Fix Plan — Follow-up to the 1024-Complaint Coverage Map

Continues from the coverage session (T028 / V029 / V030). That pass produced the
map (`test-reports/COVERAGE_REPORT.md`, `coverage-1025.csv`, `robustness.txt`).
**This pass fixes the bugs the map found.**

The two harnesses built in the coverage pass are now the **regression oracles** —
every fix below is verified by re-running them, not by hand-waving:

```bash
npx tsx server/tests/coverageSweep.ts            # lab/engine path (V029)
npx tsx server/tests/turnByTurnRobustness.ts     # live chat path (V030)
```

## Operating rules (from CLAUDE.md — non-negotiable for this work)

- Smallest correct diff. Read each file before editing. No drive-by refactors.
- **Never weaken** `safetyGate()`, red-flag hard stops, deterministic HIGH/CRITICAL
  non-downgrade, or the physician gate while fixing the disposition stage.
- **Never fabricate clinical content** (questions, differentials, dispositions, red
  flags). The 910 NO_DATA complaints are a *content-authoring* track, NOT a code
  fix — see Track C. Routing aliases (Track B) are not clinical content.
- After any `ruleExecutionEngine.ts` change: run the safety verifier
  (`npx tsx .claude/skills/clinical-safety-verifier/scripts/verify-gates.ts`) — all
  6 gates must pass.
- Synthetic data only in tests. No PHI in logs/fixtures.
- One bug per PR where possible; keep `verify-gates` and the two harnesses green.

## Priority order (why)

**Track B (live conversational engine) is P0** — real patients on WhatsApp hit
these today: 48/68 sampled conversations loop, stall, or re-greet forever.
**Track A (lab/pipeline) is P1** — internal CDS/engine correctness; clinically
sensitive (disposition gating), so it goes through `verify-gates` + physician
review. **Track C (content gaps) is a separate governance track**, not code.

---

## TRACK B — Live turn-by-turn intake engine (P0, patient-facing)

Path: `POST /whatsapp/webhook` → `handleWhatsAppKBIntake` (driven in tests via
`POST /api/test/kb-sim`). Baseline: **20/68 PASS** (only the chest-pain family +
4 graceful stops). Target after Track B: **no REPEAT, no RESET, no STALL** on
recognized complaints; unrecognized complaints fail *safely* (clarify, don't
loop).

### F-B1 — Unrecognized complaint re-greets forever (RESET, 21/48 fails)

- **Root cause:** `server/services/complaintMatchService.ts:66` `matchComplaintFromText`
  matches on `ALIASES` (from `server/data/csv/COMPLAINT_REGISTRY.csv`), then falls
  back to the slug with underscores→spaces. Complaints whose ALIASES are empty
  (`msk_back_pain`, `id_fever`, `derm_rash`, `cardio_palpitations`, shoulder, …)
  only match the literal slug phrase ("msk back pain", "id fever") — so "I have
  back pain" / "I have a fever" return `null`.
- **Then:** `server/whatsapp/kbIntake.ts` (`if (!match)` branch, ~line 920) sends
  `buildNoMatchMessage()` = the greeting and creates **no session**. Every
  subsequent turn re-matches null → re-greets. Infinite loop.
- **Fix (two surgical parts):**
  1. **Data (routing only, not clinical):** populate `ALIASES` in
     `COMPLAINT_REGISTRY.csv` for the common lay terms — "back pain", "fever",
     "rash", "palpitations"/"heart racing", "shoulder pain", etc. These are search
     synonyms, not clinical rules. Keep one canonical complaint per lay term;
     resolve overlaps deliberately (e.g. "chest pain" already routes).
  2. **Fallback safety net:** in `kbIntake.ts`, the no-match branch must **not**
     silently re-greet on repeat. After 1 unrecognized turn, either ask one
     clarifying question or open a generic-intake session — and cap consecutive
     no-match greetings (e.g. ≤2) so a patient is never stuck. Fail *safe*, not
     *silent*.
- **Acceptance:** in `turnByTurnRobustness.ts`, RESET count for back_pain, fever,
  skin_rash, palpitations, shoulder_pain → **0**; each starts an intake (or asks a
  bounded clarifier) instead of re-greeting. No new mis-routes for the chest-pain
  family (still 16/16 PASS).
- **Verify:** `npx tsx server/tests/turnByTurnRobustness.ts` → 0 `FAIL RESET`.
- **Notes/assumptions:** confirm the registry CSV is the live source the router
  loads (it is cached — `loadRegistry()`); a server restart or cache bust is
  needed after editing the CSV. Decide per-term canonical routing with clinical
  input before committing aliases.

### F-B2 — Natural-language negatives stall the conversation (STALL, 8/48 fails)

- **Root cause:** the yes/no normalization in
  `server/whatsapp/conversationalEngine.ts` (the `isYes`/`isNo`-style helpers
  ~lines 353 / 367, and the strict check at ~256) only accepts
  `no|none|false|0` / `yes|true`. "nope", "nah", "not really", "none that I know
  of", "no I don't think so" are **not** recognized → the field stays unset → no
  advance → the engine emits "Got it…" with no next question (stall).
- **Fix:** broaden the **non-safety** negative/affirmative vocabulary to map common
  NL forms to canonical `no`/`yes` *before* field assignment (nope, nah, "not
  really", "none", "no I don't think so" → no; yep, yeah, sure, "i do" → yes).
- **Safety constraint (do not violate):** boolean **safety** fields must keep their
  strict yes/no gate (`conversationalEngine.ts:256`, and the
  `canExtractSafetyField` / `pendingSafetyAsk` rules). Broaden the *general* answer
  normalizer, not the safety-field guard — or normalize NL→yes/no first and still
  require the result to be a clean yes/no for safety fields. A vague "not really"
  must **not** silently clear a red-flag safety field; if ambiguous for a safety
  field, re-ask once rather than assume.
- **Acceptance:** all 4 `nl_neg` conversations on recognized complaints advance and
  terminate (no repeated "Got it…"); STALL count → **0**. Safety-field extraction
  behavior unchanged for ambiguous input (add a unit test asserting "not really"
  does not set a CRITICAL safety field to false).
- **Verify:** `npx tsx server/tests/turnByTurnRobustness.ts` → 0 `FAIL STALL`;
  `npm run check`; targeted vitest for the normalizer.

### F-B3 — Scripted question asked twice (REPEAT, 19/48 fails)

- **Root cause:** `server/conversation/questionSequences.ts:268` `getNextGapQuestion`
  selects the next question purely by *which fields are populated* — there is **no
  "already-asked" tracking**. If a turn's answer didn't populate the field (e.g. an
  unparsed answer, or the scripted→LLM hand-off at turn ~4–6 where
  `extractAndRespond` re-proposes a field), the same question is re-selected.
  Session stores `questionIndex` (next-to-ask), not the set of asked questions.
- **Fix:** track asked questions in the session (a `Set` of asked question
  indices / field ids) and never re-emit an asked question; advance past a question
  once asked **even if its answer didn't parse**. At the scripted→LLM boundary,
  filter `extractAndRespond`'s proposed next question against the asked-set.
- **Interaction:** F-B2 reduces parse-misses, but F-B3 is still required — *any*
  unparsed answer (not just NL negatives) triggers the re-ask without it.
- **Acceptance:** REPEAT count → **0** across all recognized complaints × all 4
  answer sets; conversations still terminate (no premature dead-end). Chest-pain
  family unaffected (16/16 PASS).
- **Verify:** `npx tsx server/tests/turnByTurnRobustness.ts` → 0 `FAIL REPEAT`.

**Track B done = `turnByTurnRobustness.ts` reports the target tally** (recognized
complaints: 0 REPEAT / 0 RESET / 0 STALL; unrecognized: bounded clarifier, not a
loop). Record the final PASS/FAIL verbatim.

---

## TRACK A — Lab / pipeline engine (P1, internal CDS correctness)

Path: `executePipeline` + lab routes. Baseline: **114 PARTIAL, 0 FULL, 0 BROKEN**.

### F-A1 — Disposition rules never fire (why FULL=0)

- **Root cause:** `server/clinical/ruleExecutionEngine.ts:284`. The step-10
  ("Disposition + Plan", `ruleType:"disposition"`) candidate filter is
  `if (pipeStep.step === 10) return r.rule_type === "medication" && r.is_first_line !== false;`.
  The set was already filtered to `rule_type === "disposition"`, so this is always
  false → **no disposition rule is ever evaluated**. `finalDisposition` only ever
  comes from a red-flag escalation, else defaults to hardcoded `"HOME_CARE"` (:437).
- **Fix:** correct the step-10 filter so disposition rules are actually evaluated
  (the `medication`/`is_first_line` clause looks copy-pasted from step 10/11's
  medication handling — confirm intended split between medication first-line and
  disposition before editing). Preserve the existing
  `if (rule.rule_type === "disposition" && rule.disposition_impact && !finalDisposition)`
  guard (:333) so a red-flag escalation is **never downgraded** by a later
  disposition rule.
- **Safety (hard):** escalation must still win. Red-flag → ER/ED/911 sets
  `finalDisposition` first; disposition rules only fill when `!finalDisposition`.
  Re-confirm deterministic HIGH/CRITICAL non-downgrade after the change.
- **Acceptance:** a **non-zero** FULL population appears — specifically, complaints
  whose disposition rules actually fire under the test inputs reach FULL
  (`disposition_present=true`). Do **not** promise all 90 disp>0 complaints flip to
  FULL — many disposition rules are condition/`diagnosis_id`-gated and won't fire on
  the bland template narrative; report the real number. The classifier cross-check
  must still hold: every FULL row has `dx_count>0 AND disposition_present=true`.
- **Verify:**
  - `npx tsx .claude/skills/clinical-safety-verifier/scripts/verify-gates.ts` — all 6 pass.
  - `npx tsx server/tests/coverageSweep.ts` (fresh CSV) → FULL > 0; paste the new tally.
  - Targeted vitest for `executePipeline` disposition + escalation-non-downgrade.
- **Audit note:** if this fix changes the disposition a real encounter records,
  confirm the canonical audit append (`appendAuditEvent`) still fires for the
  disposition/escalation step and that escalation evidence is intact.

### F-A2 — `summary.topDiagnoses` always empty

- **Root cause:** `server/routes/complaintTestLab.routes.ts:21` `extractTopDiagnoses`
  reads `step.firedRules`, but the engine emits the field as `rulesFired`
  (`ruleExecutionEngine.ts:351`). So the API summary always returns
  `topDiagnoses: []` even when 30–119 diagnosis rules fired.
- **Fix:** one-line — read `step.rulesFired` (keep the `ruleType === "diagnosis"`
  + non-empty guard). Trivial, low risk (test-lab route only).
- **Acceptance:** `narrative-run` for `cough` / `persistent_cough` returns a
  non-empty `summary.topDiagnoses`.
- **Verify:** `curl … narrative-run -d '{"complaintId":"cough",…}' | jq '.summary.topDiagnoses|length'` > 0.
- **Optional cleanup:** once F-A2 lands, `coverageSweep.ts` can read
  `summary.topDiagnoses` again instead of walking `pipelineResult.steps`. Leave the
  harness as-is (steps-based) — it's the more robust oracle and shouldn't depend on
  the thing it's testing.

> Note: master-count = 1024 (not 1025) is **not a bug** — the summary query
> excludes `complaint_id='ALL'`. No fix; just the correct expectation.

---

## TRACK C — Content gaps (NOT a code fix — governance/clinical authoring)

The map's biggest number is **910 NO_DATA** (461 with dx=0 & q=0, 372 q=0, 77
dx=0): complaints missing questions and/or differentials in `kb_master_rules`.

- **This is clinical content authoring, not a code bug.** Per CLAUDE.md, Claude
  must **not** fabricate questions, differentials, dispositions, or red flags.
- **Process:** route through the physician-authored KB / `new-complaint-pathway`
  skill, with the ontology firewall and physician gate. Prioritize by real triage
  volume, not by list order.
- **Deliverable for this track:** a prioritized authoring backlog (top-N
  highest-traffic NO_DATA complaints first), owned by clinical, gated by review —
  explicitly out of scope for an automated code change.
- **Do not** "fill" NO_DATA to make the coverage tally look better. NO_DATA stays
  NO_DATA until real content is authored and reviewed.

---

## Suggested sequencing & PRs

1. **PR-1 (P0):** F-B2 (NL negatives) + F-B3 (already-asked tracking) — together
   they kill REPEAT + STALL on recognized complaints. Gate: 0 REPEAT/0 STALL.
2. **PR-2 (P0):** F-B1 (recognition + safe fallback) — needs a clinical decision on
   alias→complaint mapping. Gate: 0 RESET; chest-pain family still 16/16.
3. **PR-3 (P1):** F-A2 (one-liner) — independent, low risk.
4. **PR-4 (P1, sensitive):** F-A1 (disposition firing) — `verify-gates` + physician
   review + audit check before merge.
5. **Track C:** separate clinical backlog, not a code PR.

## Definition of done (whole plan)

- `turnByTurnRobustness.ts`: recognized complaints 0 REPEAT / 0 RESET / 0 STALL;
  unrecognized complaints fail safe (bounded clarifier, never a loop). Tally pasted
  verbatim.
- `coverageSweep.ts`: FULL > 0 with the cross-check intact; new tally pasted.
- `verify-gates.ts`: 6/6 pass. `npm run check`: clean. Targeted vitest added for the
  normalizer, the already-asked tracker, and disposition escalation-non-downgrade.
- No safety gate, red-flag, physician-gate, or audit behavior weakened. No clinical
  content fabricated. Remaining risk (esp. alias routing choices and disposition
  rule coverage) stated plainly.
```
