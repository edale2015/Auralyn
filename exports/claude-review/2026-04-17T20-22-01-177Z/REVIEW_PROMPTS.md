# Claude Review Prompts — Auralyn Medical Triage System

> Send each slice file to Claude **separately** for best results.
> After each slice, ask: "List the TOP 5 MOST DANGEROUS FAILURE MODES."

## System Overview

Use file: `01_system_overview.md`

Review this medical triage system overview.
Focus on architecture, safety boundaries, and where hallucinations could bypass safeguards.
Critical rule: only the disposition engine sets final clinical decisions.

Also note: any FILE NOT FOUND entries represent architectural components that do not
yet exist — flag these as gaps in the review.

> Then ask: "List the TOP 5 MOST DANGEROUS FAILURE MODES in this section. Be specific. Do not give generic advice. Focus on real-world clinical risk."

## Diagnosis Engine

Use file: `02_diagnosis_engine.md`

Review this diagnosis engine.
Focus on mathematical correctness, stability under contradictory inputs,
and failure modes that could bias toward low-risk diagnoses.

Note any FILE NOT FOUND components — these represent architectural gaps
where critical diagnosis logic may be absent or unimplemented.

> Then ask: "List the TOP 5 MOST DANGEROUS FAILURE MODES in this section. Be specific. Do not give generic advice. Focus on real-world clinical risk."

## Disposition and Safety Core

Use file: `03_disposition_safety.md`

This is the core safety layer. It determines whether a patient is sent home vs escalated.
CRITICAL — review for:
  - Unsafe under-triage risk
  - Logic gaps in red flag handling
  - Conflicts between hallucination guards
  - Any code path where a dangerous case could incorrectly pass all gates

FILE NOT FOUND entries = components the architecture expects but are absent.

> Then ask: "List the TOP 5 MOST DANGEROUS FAILURE MODES in this section. Be specific. Do not give generic advice. Focus on real-world clinical risk."

## Validation Discipline

Use file: `04_validation.md`

Review this validation system.
Focus on:
  - Whether unsafe cases can slip through testing
  - Weaknesses in adversarial case generation
  - Missing failure scenarios (sepsis, PE, ACS, stroke)
  - Calibration flaws that could mask confidence errors
  - Whether the validation gate threshold is appropriately conservative

> Then ask: "List the TOP 5 MOST DANGEROUS FAILURE MODES in this section. Be specific. Do not give generic advice. Focus on real-world clinical risk."

## Control Tower and Streaming

Use file: `05_control_tower.md`

Review this real-time patient monitoring system.
Focus on:
  - Stale state and missed update scenarios
  - Race conditions in concurrent patient streams
  - Incorrect risk prioritization
  - WebSocket auth and tenant isolation gaps
  - Dashboard data consistency under high load

> Then ask: "List the TOP 5 MOST DANGEROUS FAILURE MODES in this section. Be specific. Do not give generic advice. Focus on real-world clinical risk."

## Digital Twin and Case Generation

Use file: `06_simulation.md`

Review this simulation and synthetic case generation layer.
Focus on:
  - Realism of generated patient cases
  - Adequate edge-case coverage (sepsis, PE, ACS, stroke)
  - Biases in synthetic data that could hide validation gaps
  - Whether the digital twin accurately reflects clinical deterioration

Note: FILE NOT FOUND for specific condition generators means those high-risk
scenarios (PE, ACS, sepsis) are not explicitly stress-tested.

> Then ask: "List the TOP 5 MOST DANGEROUS FAILURE MODES in this section. Be specific. Do not give generic advice. Focus on real-world clinical risk."

## Clinical RAG Copilot

Use file: `07_clinical_rag.md`

This KB-grounded clinical answer system must NEVER influence final disposition.
Review for:
  - Any pathway where RAG output could leak into disposition decisions
  - False confidence signals from the uncertainty layer
  - Weak grounding logic (hallucinated citations)
  - Missing physician review gate enforcement
  - Audit trail completeness for regulatory purposes

> Then ask: "List the TOP 5 MOST DANGEROUS FAILURE MODES in this section. Be specific. Do not give generic advice. Focus on real-world clinical risk."

## RLHF and Safe Learning

Use file: `08_rlhf.md`

Review this learning system.
Focus on:
  - Risk of unsafe drift in clinical weights over time
  - Whether weight bounds are sufficient to prevent dangerous updates
  - Evidence threshold adequacy
  - Physician gating effectiveness
  - Whether rejected proposals correctly block future re-application

> Then ask: "List the TOP 5 MOST DANGEROUS FAILURE MODES in this section. Be specific. Do not give generic advice. Focus on real-world clinical risk."

## FDA and Audit Layer

Use file: `09_fda_audit.md`

Review this audit and regulatory compliance layer.
Focus on:
  - Completeness of audit traceability
  - SHA-256 chain tamper resistance
  - Missing required fields for 21 CFR Part 11 / Part 820
  - Whether the audit chain can be forged or gapped
  - FDA De Novo submission readiness

FILE NOT FOUND entries represent missing regulatory infrastructure.

> Then ask: "List the TOP 5 MOST DANGEROUS FAILURE MODES in this section. Be specific. Do not give generic advice. Focus on real-world clinical risk."

---

## Final Meta Prompt (send after all slices)

You have reviewed all modules of a medical triage system. Now answer:
1. Where can unsafe **under-triage** still occur?
2. What is the **single most dangerous failure path**?
3. Which module gives a **false sense of safety**?
4. What should be **fixed first** before clinical deployment?
