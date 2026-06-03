# Auralyn Session Plan — Prove the last session, then finish listen-first

> **Instruction to the Replit agent:** Execute in order. The previous session
> CLAIMED F017 and T018 are done but pasted no verbatim verification output and
> substituted a different test suite. This session does not accept summaries.
> Paste raw command output verbatim under each task. If a check fails, REPORT
> the failure — do NOT change thresholds, swap test suites, or hand-write
> example output. A claim without pasted output is treated as NOT done.

## Session goal

Two things: (1) prove the F017 speed change and the T018 acknowledgment with
real, pasted output instead of asserted numbers; (2) build the missing half of
listen-first — Auralyn must NOT re-ask a question whose answer the patient
already volunteered.

---

## V019 — Prove F017 and T018 with verbatim output (no new code)

**Status:** ⏳ Not started

**Acceptance criteria:**
1. Paste the raw `time` output for a short-reply scripted turn against the LIVE
   endpoint. The `real` line must be present and visible.
2. Paste the raw output of `npm run test:conversation` — the SAME suite from
   prior sessions (the 17-scenario conversation suite). If that script no
   longer exists or the count is not 17, say so and explain what "10/10 golden
   cases" actually tests instead. Do not present golden cases as if they were
   the conversation suite.
3. Paste a real two-turn transcript captured from the live endpoint using the
   monologue below — actual JSON responses, not a hand-written example.

**Verification:**
```bash
# 1. Timing on a short scripted reply (use the live endpoint found in V016)
time curl -s -X POST <LIVE_ENDPOINT> \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"prove-perf","message":"yes"}'

# 2. The conversation test suite — paste the WHOLE output
npm run test:conversation

# 3. Real two-turn capture with a wordy monologue
curl -s -X POST <LIVE_ENDPOINT> \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"prove-listen","message":"Ive had a bad headache for 3 days, some nausea, and I threw up twice this morning. No fever."}' | jq

curl -s -X POST <LIVE_ENDPOINT> \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"prove-listen","message":""}' | jq
```

**Required output:** All three outputs pasted verbatim. State plainly whether
the follow-up question in step 3 re-asks headache, nausea, vomiting, or fever.
If it does, that confirms the gap below and F020 is required.

**Dependencies:** none

---

## F020 — Gap-skipping: never ask what the patient already answered

**Status:** ⏳ Not started

**Files to modify:** the live conversation module from V016 and its question
selector.

**Acceptance criteria:**
1. After extraction on any turn, the question selector marks every required
   field that now has a value as ANSWERED.
2. The next question chosen is the first required field that is still UNANSWERED
   — NOT simply the next index in the scripted list. Answered fields are
   skipped entirely.
3. Using the monologue in V019 step 3, the follow-up question must target a GAP
   (e.g. neuro/vision symptoms, onset detail not yet given) and must NOT ask
   about headache, nausea, vomiting, or fever.
4. If the patient later gives a value that contradicts an earlier one, the new
   value overwrites the old and that field stays ANSWERED (no loop, no reset).
5. Safety unchanged: red-flag/escalation still runs on every turn, including on
   findings extracted from the opening monologue (not only on explicitly-asked
   ones).

**Verification:**
```bash
# Same monologue, then continue — follow-up must be a GAP, not a re-ask
curl -s -X POST <LIVE_ENDPOINT> \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"gap-test","message":"Ive had a bad headache for 3 days, some nausea, and I threw up twice this morning. No fever."}' | jq -r '.reply'

curl -s -X POST <LIVE_ENDPOINT> \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"gap-test","message":""}' | jq -r '.reply'

# Regression: scripted suite still passes
npm run test:conversation
```

**Required output:** Paste both `.reply` lines verbatim. The second must NOT
contain "headache", "nausea", "vomit", "throw", or "fever". Paste the test
suite result. If the follow-up still re-asks an answered field, REPORT it — do
not adjust the test to pass.

**Dependencies:** V019

---

## Order

Start with **V019**. If its step-3 follow-up already skips the answered fields,
then F020 is partly done and you only need to confirm the remaining criteria.
If it re-asks them (expected), F020 is the real work of this session.

## Hard rules

- A claim with no pasted command output = NOT done. Summaries like "30× faster"
  or "under 100 ms" are not evidence; the `time` output is.
- Do not swap test suites. If `npm run test:conversation` is gone or its count
  changed, explain why instead of reporting a different number.
- Every task appears in the final summary as ✅ Done (output pasted) /
  ⚠️ Partial / ❌ Blocked.

## Summary checklist

- [ ] V019 — F017/T018 proven (or gaps reported) with verbatim output
- [ ] F020 — answered fields skipped, no re-asking, suite still green
