# Auralyn Session Plan — Conversation Engine: verify, speed, listen-first

> **Instruction to the Replit agent:** Execute this session plan in order.
> Start with V016. Do not skip verification. Paste each verification output
> verbatim under its task. If any output differs from "Required output,"
> REPORT the difference — do not modify thresholds, tests, seed data, or
> demo configs to make a check pass. Every task must appear in the final
> summary with status ✅ Done / ⚠️ Partial / ❌ Blocked.

## Session goal

The last conversation-engine update produced no change in live behavior, and
latency is high even for scripted questions. This session (1) proves where the
live chat actually gets its questions and whether the last edit is running,
(2) makes known/scripted questions instant, and (3) restructures the opening
turn to listen first and ask only gaps.

---

## V016 — Locate the live conversation path and prove whether the last edit is running

**Status:** ⏳ Not started

**Files to find first:** Locate the module that the *live* WhatsApp/chat
encounter actually executes (NOT `server/tests/conversationTestHarness.ts`).
Trace from the live HTTP/webhook handler inward. Report the real file path and
the real endpoint.

**Acceptance criteria:**
1. Report the exact file and function that produces the *next question* in a
   live chat turn.
2. State definitively whether the question text is (a) hardcoded in the engine,
   (b) assembled in a prompt, or (c) read from the clinical KB / voice-capture
   question contexts. Name the source table or file.
3. Confirm whether the live path and the test harness call the *same*
   question-selection function or two different ones. If different, say so
   explicitly — this is the suspected root cause.
4. Show that the most recent edit is present in the running code (grep the
   distinctive string from the last change in the live module, and confirm the
   server was rebuilt/restarted after it).

**Verification:**
```bash
# 1. Find the live endpoint (webhook or api route), not the test harness
grep -rn "whatsapp\|/api/conversation\|conversationEngine\|nextQuestion\|elicit" server --include=*.ts | grep -vi test

# 2. Confirm last edit's distinctive string is in the LIVE module
#    (replace SENTINEL with a unique phrase from the last change)
grep -rn "SENTINEL" server --include=*.ts | grep -vi test

# 3. Confirm the build/process serving the chat is newer than the file edit time
ls -la --time-style=full-iso $(grep -rl "nextQuestion\|elicit" server --include=*.ts | grep -vi test)
```

**Required output:** A short written finding naming (a) the live question-source
layer, (b) whether live and test share code, and (c) whether the last edit
string appears in the live module. No code changes in this task.

**Dependencies:** none

---

## F017 — Make scripted/known questions instant (no model round-trip)

**Status:** ⏳ Not started

**Files to modify:** the live conversation module identified in V016.

**Acceptance criteria:**
1. When the next action is a *known scripted question* (text already
   determined), the turn returns it WITHOUT any GPT/LLM call.
2. When the patient's reply is a simple value that the existing keyword /
   `isExplicitlyPositive()` logic already resolves, the field is filled WITHOUT
   a GPT call.
3. The GPT extraction call fires ONLY when the reply is free-form text that
   keyword logic cannot resolve.
4. The model and KB config are warmed on session creation so the first real
   question is not cold-start slow.
5. No change to clinical safety behavior: the existing dehydration/nausea
   ER-escalation combo check and negation detection still fire identically
   (re-run the test harness, still 17/17).

**Verification:**
```bash
# Measure latency on a scripted-question turn (use the live endpoint from V016).
# A scripted turn should be well under 200ms; a free-text extraction turn ~1s.
time curl -s -X POST <LIVE_ENDPOINT_FROM_V016> \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"perf-test","message":"yes"}'

# Confirm safety tests still pass after the change
npm run test:conversation
```

**Required output:** Scripted-turn `real` time < 0.20s pasted verbatim; test
harness output showing `17/17` (or current passing count) pasted verbatim. If
the scripted turn still calls GPT, REPORT that — do not adjust the threshold.

**Dependencies:** V016

---

## T018 — Listen-first opening turn: extract everything, then ask only gaps

**Status:** ⏳ Not started

**Files to find first:** the list of required fields per complaint cluster (the
voice-capture question contexts) so the gap check reads from the real
definition, not a hardcoded list.

**Files to modify:** the live conversation module from V016.

**Acceptance criteria:**
1. On the patient's first free-text reply to "what can I do for you?", run ONE
   extraction pass that fills *every* required field the patient volunteered
   (multiple symptoms, onset, severity, history).
2. The next message from Auralyn acknowledges what was heard in one short line
   (restates the symptoms captured) — "noticeably listening" before asking.
3. Auralyn then asks ONLY the fields still missing after extraction. It must
   NOT re-ask anything the patient already stated.
4. If the patient later revises an earlier answer, the revised value overwrites
   the old one without resetting the conversation (preserve existing
   answer-change tolerance).
5. Red-flag / ER-escalation logic still fires on extracted findings, not only
   on explicitly-asked ones (a volunteered red-flag symptom in the opening
   monologue must still escalate).

**Verification:**
```bash
# Multi-symptom opening monologue — Auralyn must acknowledge and then NOT
# re-ask the volunteered fields.
curl -s -X POST <LIVE_ENDPOINT_FROM_V016> \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"listen-test","message":"Ive had a bad headache for 3 days, some nausea, and I threw up twice this morning. No fever."}' | jq

# Then send the next turn and confirm the follow-up targets a GAP
# (e.g. vision/neuro), NOT headache/nausea/vomiting which were already stated.
```

**Required output:** Paste both turn responses verbatim. The first must contain
an acknowledgment of headache + nausea + vomiting. The follow-up question must
NOT ask about headache, nausea, vomiting, or fever (all volunteered). If it
re-asks any of these, REPORT it — that is the bug this task fixes.

**Dependencies:** V016, F017

---

## Order

Start with **V016** — it unblocks everything, because F017 and T018 both edit
"the live module," and right now there is no proof which file that is. Do not
skip it even if it seems obvious.

## Hard rules for this session

- Tests passing is not proof. The live path and the test harness have
  apparently diverged. Verify against the **live endpoint**, never only the
  harness.
- A failing verification is information. If output differs from "Required
  output," REPORT it. Do not change the threshold, test, seed data, or demo
  config to turn it green.
- Every task must appear in the final summary with status ✅ Done (output
  pasted) / ⚠️ Partial (done vs not) / ❌ Blocked (reason). Listing a task as
  "in progress" and never returning to it is not acceptable.

## Summary checklist

- [ ] V016 — live question source + edit-is-running proven
- [ ] F017 — scripted questions instant, 17/17 still passing
- [ ] T018 — listen-first opening, no re-asking volunteered fields
