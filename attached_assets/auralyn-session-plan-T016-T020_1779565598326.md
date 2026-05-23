# Auralyn Session Plan — T016–T020

## Header

**Continues from:** T001–T015 (Master Rule Map, clinical pipeline, multi-agent
orchestration, RLHF governance, safety gates — all DONE in prior sessions).
**Do not re-verify T001–T015.**

**Goal of this session:** Build, from scratch, a per-agent **model benchmark +
routing scorecard** with a **routing telemetry dashboard**, inspired by the
Basis architecture (a supervisor routing tasks to specialist sub-agents, backed
by an internal benchmark suite that scores each candidate model per task so
models can be swapped on evidence rather than guesswork).

**Confirmed scope decisions this session:**
- No eval harness exists yet — T017 BUILDS one from scratch (defines its own
  `npm run benchmark` script).
- Scorecard priority is BOTH equally: (a) prove `clinical_brain` stays pinned,
  AND (b) capture cost/speed savings on non-safety agents. Both are weighted
  acceptance criteria, neither is optional.
- Dashboard IS in scope: T019 records routing telemetry, T020 builds the UI.

**Critical domain difference from the Basis source article — read first:**
Basis can let agents run unsupervised and review only the final output because
accounting outputs are *programmatically verifiable* (a reconciliation balances
or it doesn't). Clinical triage is NOT verifiable this way and a wrong call is
not cheaply recoverable. Therefore we adopt ONLY the benchmark-and-route idea.
We DO NOT adopt the "run unsupervised, review at the end" posture.
`clinical_brain` is pinned by policy; the Safety Veto / supervisor stays in the
per-step path and is never bypassed by routing.

---

## T016 — Locate routing/agent config and confirm assumptions

**Status:** ⏳ Not started

**Files to find first:**
- The agent/model assignment config (where each agent's model string is set).
  Likely under `server/context/` or an agent-orchestration module. Search for
  `clinical_brain`, `Safety Veto`, `supervisor`, and hardcoded model strings
  (beginning `claude-` or `gpt-`).
- The context telemetry module (search `telemetry` under `server/context/`).
- The client telemetry/dashboard area (search `dashboard` under `client/`).

**Files to create:** none (discovery only)

**Files to modify:** none

**Acceptance criteria:**
1. Report exact file path(s) where each agent's model is assigned.
2. Report the current model string for `clinical_brain` and for the safety
   supervisor agent, verbatim.
3. Report the telemetry sink path and how it persists (table name or file).
4. Report whether a client dashboard area exists and its path.

**Verification:**
```bash
grep -rn "clinical_brain" server/ | head -40
grep -rniE "claude-|gpt-|model[\"' :=]" server/context/ | head -60
grep -rni "telemetry" server/context/ | head -20
ls -R client/ | grep -i dashboard || echo "NO DASHBOARD DIR FOUND"
```

**Required output:** File-path list, the two model strings verbatim, the
telemetry sink location, and either a dashboard path or `NO DASHBOARD DIR FOUND`.

**Dependencies:** none

---

## T017 — Build the benchmark harness from scratch (scores models per agent)

**Status:** ⏳ Not started

**Files to find first:** the agent config path confirmed in T016 — do not guess.

**Files to create:**
- `server/eval/agentBenchmark.ts` — runs fixed clinical-task cases through a
  given (agent, model) pair; records latency_ms + a structured score per case.
- `server/eval/cases/` — at least 12 benchmark cases sourced from REAL complaint
  configs in the live `kb_master_rules` table, NOT inline demo configs.
- An `npm run benchmark` script entry in `package.json` that invokes the harness.

**Files to modify:** `package.json` (add the `benchmark` script only).

**Acceptance criteria:**
1. The harness pulls cases from the production KB path, not demo/test fixtures
   (no `_inlineConfig`, no `/api/encounter/demo`).
2. Per (agent, model) pair it records latency_ms, a structured score, and the
   agent name, written to a persisted artifact (JSON file or table), not just logs.
3. Coverage ≥ 4 distinct agent types and ≥ 12 cases.
4. Running the harness does NOT mutate any production encounter or memory row.

**Verification:**
```bash
npm run benchmark 2>&1 | tee /tmp/bench.out
grep -ri "_inlineConfig\|/api/encounter/demo" server/eval/ && echo "FAIL: uses demo fixtures" || echo "OK: no demo-fixture references"
cat /tmp/bench.out | grep -c "agent="
```

**Required output:** `OK: no demo-fixture references`, the `grep -c` count ≥ 12,
and `/tmp/bench.out` shows ≥ 4 distinct agent names. Paste `/tmp/bench.out`
verbatim. If `npm run benchmark` errors, REPORT the error and stop — do not
invent a passing run.

**Dependencies:** T016

---

## T018 — Wire routing to the scorecard; pin clinical_brain; keep safety non-bypassable

**Status:** ⏳ Not started

**Files to find first:** the agent/model assignment path from T016.

**Files to create:**
- `server/context/modelRouter.ts` — selects a model per agent from the T017
  scorecard, subject to the hard policy below.

**Files to modify:**
- The agent assignment path from T016, to call `modelRouter` instead of
  hardcoded model strings — EXCEPT for the pinned agents.

**Acceptance criteria (BOTH weighted equally — neither is optional):**
1. **(Safety half)** `clinical_brain` is pinned in code via a guard: the router
   returns its current model unconditionally and rejects any scorecard result
   that would downgrade it. The safety supervisor / Safety Veto runs on every
   encounter regardless of routing; routing cannot remove it from the per-step
   path.
2. **(Savings half)** For non-pinned agents, the router selects the
   highest-scoring model within that agent's latency budget, and a test
   demonstrates at least one non-pinned agent being routed to a
   cheaper/faster model than its previous hardcoded default.
3. A real production encounter still produces ≥ 12 artifacts of ≥ 4 types after
   routing is wired in.

**Verification:**
```bash
grep -n "clinical_brain" server/context/modelRouter.ts
npm test -- modelRouter 2>&1 | tee /tmp/router.out

ENCOUNTER_ID=$(curl -s -X POST localhost:3000/api/encounter \
  -H "Content-Type: application/json" \
  -d '{"complaintId":"chest_pain","patientInput":{"age":58,"sex":"M","vitals":{"hr":96,"sbp":158,"dbp":92,"spo2":97}}}' \
  | jq -r '.sessionId')

curl -s localhost:3000/api/context/$ENCOUNTER_ID/state | jq '{
  total: (.artifacts | length),
  type_count: ([.artifacts[].type] | unique | length)
}'
```

**Required output:** `/tmp/router.out` shows BOTH (a) a passing test asserting a
`clinical_brain` downgrade is REJECTED, and (b) a passing test showing a
non-pinned agent routed to a cheaper model. The `jq` block shows `total ≥ 12`
and `type_count ≥ 4`. Paste both verbatim. If the encounter yields 0 artifacts,
REPORT it — do not adjust thresholds.

**Dependencies:** T017

---

## T019 — Record routing telemetry

**Status:** ⏳ Not started

**Files to find first:** the telemetry sink path from T016.

**Files to create:** a `routing_telemetry` table/migration if none exists.

**Files to modify:**
- The telemetry module, to record each routing decision: agent, chosen_model,
  pinned (bool), and the score that drove the choice, plus a timestamp.

**Acceptance criteria:**
1. Every routing decision from T018 emits exactly one telemetry record with
   those fields.
2. Pinned decisions are flagged `pinned = true`.
3. A read endpoint `GET /api/routing/telemetry` returns recent records as JSON
   (this is what T020's dashboard will call — it must exist and return real
   rows, not a stub).

**Verification:**
```bash
# run one encounter first (reuse T018's curl), then:
psql -c "SELECT agent, chosen_model, pinned, score FROM routing_telemetry
WHERE created_at > now() - interval '5 minutes';" 2>&1 | tee /tmp/tel.out
curl -s localhost:3000/api/routing/telemetry | jq 'length'
```

**Required output:** `/tmp/tel.out` shows ≥ 1 row including a `pinned = t` row
for `clinical_brain`, AND the `curl ... | jq 'length'` returns ≥ 1. Paste both
verbatim. If the table or endpoint doesn't exist, REPORT it.

**Dependencies:** T018

---

## T020 — Build the routing telemetry dashboard UI

**Status:** ⏳ Not started

**Files to find first:** the client dashboard area from T016. If `NO DASHBOARD
DIR FOUND` was reported, create a new route under `client/` and say so.

**Files to create / modify:**
- A dashboard view that calls `GET /api/routing/telemetry` (the REAL endpoint
  from T019 — not mock data) and renders per-agent rows showing chosen model,
  whether it was pinned, and the score.

**Acceptance criteria:**
1. The dashboard fetches from the live `GET /api/routing/telemetry` endpoint.
   It must NOT use hardcoded/mock telemetry data.
2. Pinned agents (e.g. `clinical_brain`) are visually marked as pinned.
3. The view renders at least the rows produced by a real encounter run.
4. If the endpoint returns empty, the UI shows an empty-state message — it does
   NOT fabricate placeholder rows.

**Verification:**
```bash
# confirm the dashboard calls the real endpoint, not mock data:
grep -rn "/api/routing/telemetry" client/ && echo "OK: calls real endpoint"
grep -rni "mockTelemetry\|fakeRows\|placeholderData" client/ && echo "FAIL: mock data present" || echo "OK: no mock data"
# build must succeed:
npm run build 2>&1 | tail -20
```

**Required output:** `OK: calls real endpoint`, `OK: no mock data`, and a
successful build. Paste the build tail verbatim. If you cannot wire the UI to
the real endpoint, REPORT that and stop — do not ship a mock-data dashboard.

**Dependencies:** T019

---

## Summary checklist

- [ ] T016 — Locate routing/agent config, telemetry sink, dashboard area
- [ ] T017 — Build benchmark harness from scratch (≥12 cases, ≥4 agents)
- [ ] T018 — Wire router; pin clinical_brain (safety) + route others (savings)
- [ ] T019 — Record routing telemetry + read endpoint
- [ ] T020 — Build routing telemetry dashboard against the real endpoint

---

## Hard rules (from auralyn-no-fudging)

1. **No synthetic-fixture passes.** Verification hits production
   `POST /api/encounter`, never `/api/encounter/demo` or `_inlineConfig`.
2. **No skipping the invasive edit.** T018 requires editing the real agent
   assignment path. `modelRouter.ts` alone is half the task.
3. **No re-verifying T001–T015.** They are done. Stay on T016–T020.
4. **No threshold-fudging.** A failing verification is information — REPORT it,
   do not edit the test, seed, threshold, or config to turn it green.
5. **No mock-data dashboard (T020).** The UI must call the real T019 endpoint.
   A dashboard rendering hardcoded rows is fudging — report and stop instead.
6. **Paste outputs verbatim** under each task. No "looks correct."
7. **Final summary must list ALL five tasks** with ✅ Done / ⚠️ Partial /
   ❌ Blocked and the real status. Omitting a task is fudging.
8. **Domain guardrail:** Do NOT introduce any "run unsupervised, review at the
   end" behavior from the source article. `clinical_brain` stays pinned; the
   safety supervisor stays in the per-step path. If any task tempts a change
   that weakens per-step safety, STOP and report.

---

## Order

Start with **T016** — every later task needs the confirmed paths (agent config,
telemetry sink, dashboard area); guessing them violates the no-guess rule. Then
**T017** (the scorecard must exist before routing can use it), then **T018** (the
wire-up plus both safety and savings guards), then **T019** (telemetry record +
read endpoint, which T020 depends on), then **T020** (the UI, last, because it
consumes the endpoint T019 creates).

---

## Final gap closure verification

Run after all five tasks. Prints `GAP CLOSURE VERIFIED` only if the pipeline
still produces a healthy artifact set on the production path, a pinned
`clinical_brain` routing record exists, and the dashboard calls the real
endpoint:

```bash
ENCOUNTER_ID=$(curl -s -X POST localhost:3000/api/encounter \
  -H "Content-Type: application/json" \
  -d '{"complaintId":"chest_pain","patientInput":{"age":58,"sex":"M","vitals":{"hr":96,"sbp":158,"dbp":92,"spo2":97}}}' \
  | jq -r '.sessionId')

ART=$(curl -s localhost:3000/api/context/$ENCOUNTER_ID/state \
  | jq '(.artifacts | length) as $t | ([.artifacts[].type] | unique | length) as $c
        | if $t >= 12 and $c >= 4 then 1 else 0 end')

PIN=$(psql -tA -c "SELECT count(*) FROM routing_telemetry
  WHERE agent='clinical_brain' AND pinned = true
  AND created_at > now() - interval '5 minutes';")

UI=$(grep -rl "/api/routing/telemetry" client/ | wc -l)

if [ "$ART" = "1" ] && [ "$PIN" -ge 1 ] && [ "$UI" -ge 1 ]; then
  echo "GAP CLOSURE VERIFIED"
else
  echo "GAP NOT CLOSED: artifacts_ok=$ART clinical_brain_pinned_rows=$PIN dashboard_wired=$UI"
fi
```
