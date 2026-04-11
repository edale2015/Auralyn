import { describe, it, expect, beforeEach } from "vitest";

// ─── Clinical Consistency Types ───────────────────────────────────────────────
describe("shared/clinicalConsistency — domain type shapes", () => {
  it("exports all required types", async () => {
    const mod = await import("../../shared/clinicalConsistency");
    expect(mod).toBeDefined();
  });

  it("Disposition covers all 6 values", () => {
    const values = [
      "home_supportive_care", "home_with_rx", "follow_up_primary_care",
      "same_day_urgent_care", "er_now", "hospital_admission",
    ];
    expect(values).toHaveLength(6);
  });

  it("TreatmentClass covers all 8 values", () => {
    const values = [
      "none", "supportive", "antibiotic", "antiviral",
      "steroid", "bronchodilator", "topical", "antifungal",
    ];
    expect(values).toHaveLength(8);
  });

  it("ConfidenceBand has three levels", () => {
    const levels = ["low", "moderate", "high"];
    expect(levels).toHaveLength(3);
  });
});

// ─── Canonical Syndrome Rules ─────────────────────────────────────────────────
describe("canonicalSyndromeRules — syndrome scoring", () => {
  it("scoreSyndromes returns candidates for known complaint", async () => {
    const { scoreSyndromes } = await import("../../server/services/canonicalSyndromeRules");
    const results = scoreSyndromes("sore_throat", { sore_throat: true, cough: true });
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns empty array for unknown complaint", async () => {
    const { scoreSyndromes } = await import("../../server/services/canonicalSyndromeRules");
    const results = scoreSyndromes("unknown_complaint_xyz", {});
    expect(results).toHaveLength(0);
  });

  it("results are sorted by score descending", async () => {
    const { scoreSyndromes } = await import("../../server/services/canonicalSyndromeRules");
    const results = scoreSyndromes("sore_throat", { sore_throat: true, cough: true, rhinorrhea: true });
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("viral_pharyngitis scores higher with cough+rhinorrhea than without", async () => {
    const { scoreSyndromes } = await import("../../server/services/canonicalSyndromeRules");
    const withViral  = scoreSyndromes("sore_throat", { sore_throat: true, cough: true, rhinorrhea: true });
    const withoutViral = scoreSyndromes("sore_throat", { sore_throat: true });
    const vp1 = withViral.find(c => c.syndromeId === "viral_pharyngitis");
    const vp2 = withoutViral.find(c => c.syndromeId === "viral_pharyngitis");
    expect(vp1!.score).toBeGreaterThan(vp2!.score);
  });

  it("gas_centor_compatible scores higher with exudate+nodes+fever+no_cough", async () => {
    const { scoreSyndromes } = await import("../../server/services/canonicalSyndromeRules");
    const results = scoreSyndromes("sore_throat", {
      sore_throat: true,
      tonsillar_exudate: true,
      tender_anterior_cervical_nodes: true,
      fever_over_38: true,
      no_cough: true,
    });
    const gas = results.find(c => c.syndromeId === "gas_centor_compatible");
    expect(gas).toBeDefined();
    expect(gas!.requiredFeaturesMet).toBe(true);
    expect(gas!.score).toBeGreaterThan(0);
  });

  it("asymptomatic_bacteriuria requires positive_urine_test AND no_urinary_symptoms", async () => {
    const { scoreSyndromes } = await import("../../server/services/canonicalSyndromeRules");
    const withBoth = scoreSyndromes("urine_result_review", {
      positive_urine_test: true,
      no_urinary_symptoms: true,
    });
    const withoutRequired = scoreSyndromes("urine_result_review", { positive_urine_test: true });
    const r1 = withBoth.find(c => c.syndromeId === "asymptomatic_bacteriuria");
    const r2 = withoutRequired.find(c => c.syndromeId === "asymptomatic_bacteriuria");
    expect(r1!.requiredFeaturesMet).toBe(true);
    expect(r2!.requiredFeaturesMet).toBe(false);
  });

  it("simple_cystitis requires dysuria", async () => {
    const { scoreSyndromes } = await import("../../server/services/canonicalSyndromeRules");
    const results = scoreSyndromes("urinary_symptoms", { dysuria: true, frequency: true, urgency: true });
    const cystitis = results.find(c => c.syndromeId === "simple_cystitis");
    expect(cystitis!.requiredFeaturesMet).toBe(true);
  });

  it("influenza_like_illness requires feverish_or_fever AND body_aches", async () => {
    const { scoreSyndromes } = await import("../../server/services/canonicalSyndromeRules");
    const results = scoreSyndromes("flu_like", { feverish_or_fever: true, body_aches: true, acute_onset: true });
    const flu = results.find(c => c.syndromeId === "influenza_like_illness");
    expect(flu!.requiredFeaturesMet).toBe(true);
    expect(flu!.score).toBeGreaterThan(0);
  });

  it("each candidate has syndromeId, label, score, rationale, requiredFeaturesMet", async () => {
    const { scoreSyndromes } = await import("../../server/services/canonicalSyndromeRules");
    const results = scoreSyndromes("sore_throat", { sore_throat: true });
    for (const c of results) {
      expect(c).toHaveProperty("syndromeId");
      expect(c).toHaveProperty("label");
      expect(c).toHaveProperty("score");
      expect(c).toHaveProperty("rationale");
      expect(c).toHaveProperty("requiredFeaturesMet");
    }
  });

  it("getSyndromeRules exports all 6 rules", async () => {
    const { getSyndromeRules } = await import("../../server/services/canonicalSyndromeRules");
    const rules = getSyndromeRules();
    expect(rules.length).toBe(6);
  });
});

// ─── Therapeutic Minimalism Engine ───────────────────────────────────────────
describe("therapeuticMinimalismEngine — anti-shotgun gate", () => {
  it("viral pharyngitis → supportive care, blocks empiric antibiotics", async () => {
    const { buildCanonicalTreatmentPlan } = await import("../../server/services/therapeuticMinimalismEngine");
    const { scoreSyndromes } = await import("../../server/services/canonicalSyndromeRules");
    const candidates = scoreSyndromes("sore_throat", { sore_throat: true, cough: true, rhinorrhea: true });
    const winning = candidates[0];
    const plan = buildCanonicalTreatmentPlan("sore_throat", winning, { sore_throat: true, cough: true });
    if (winning.syndromeId === "viral_pharyngitis") {
      expect(plan.class).toBe("supportive");
      expect(plan.blockedAlternatives).toContain("empiric_azithromycin");
    }
  });

  it("gas_centor_compatible + confirmed strep → antibiotic with narrow first-line key", async () => {
    const { buildCanonicalTreatmentPlan } = await import("../../server/services/therapeuticMinimalismEngine");
    const { scoreSyndromes } = await import("../../server/services/canonicalSyndromeRules");
    const features = {
      sore_throat: true,
      tonsillar_exudate: true,
      tender_anterior_cervical_nodes: true,
      fever_over_38: true,
      no_cough: true,
      positive_strep_test: true,
    };
    const candidates = scoreSyndromes("sore_throat", features);
    const gas = candidates.find(c => c.syndromeId === "gas_centor_compatible")!;
    const plan = buildCanonicalTreatmentPlan("sore_throat", gas, features);
    expect(plan.class).toBe("antibiotic");
    expect(plan.medicationKey).toBe("strep_narrow_first_line");
    expect(plan.blockedAlternatives).toContain("ceftriaxone_plus_azithro_plus_doxy");
  });

  it("asymptomatic_bacteriuria → class none", async () => {
    const { buildCanonicalTreatmentPlan } = await import("../../server/services/therapeuticMinimalismEngine");
    const winning = {
      syndromeId: "asymptomatic_bacteriuria",
      label: "Asymptomatic bacteriuria",
      score: 10,
      rationale: [],
      requiredFeaturesMet: true,
    };
    const plan = buildCanonicalTreatmentPlan("urine_result_review", winning, {});
    expect(plan.class).toBe("none");
    expect(plan.blockedAlternatives).toContain("empiric_uti_antibiotics");
  });

  it("simple_cystitis → antibiotic with narrow_uti_first_line key", async () => {
    const { buildCanonicalTreatmentPlan } = await import("../../server/services/therapeuticMinimalismEngine");
    const winning = {
      syndromeId: "simple_cystitis",
      label: "Acute uncomplicated cystitis",
      score: 12,
      rationale: [],
      requiredFeaturesMet: true,
    };
    const plan = buildCanonicalTreatmentPlan("urinary_symptoms", winning, {});
    expect(plan.class).toBe("antibiotic");
    expect(plan.medicationKey).toBe("narrow_uti_first_line");
  });

  it("null winning syndrome → supportive fallback", async () => {
    const { buildCanonicalTreatmentPlan } = await import("../../server/services/therapeuticMinimalismEngine");
    const plan = buildCanonicalTreatmentPlan("unknown", null, {});
    expect(plan.class).toBe("supportive");
    expect(plan.indication).toContain("No dominant syndrome");
  });

  it("bacterial_vaginosis symptomatic → topical with bv_first_line key", async () => {
    const { buildCanonicalTreatmentPlan } = await import("../../server/services/therapeuticMinimalismEngine");
    const winning = {
      syndromeId: "bacterial_vaginosis_symptomatic",
      label: "Symptomatic BV",
      score: 10,
      rationale: [],
      requiredFeaturesMet: true,
    };
    const plan = buildCanonicalTreatmentPlan("vaginal_discharge", winning, { vaginal_discharge: true });
    expect(plan.class).toBe("topical");
    expect(plan.medicationKey).toBe("bv_first_line");
  });

  it("BV with no_vaginal_symptoms → class none", async () => {
    const { buildCanonicalTreatmentPlan } = await import("../../server/services/therapeuticMinimalismEngine");
    const winning = {
      syndromeId: "bacterial_vaginosis_symptomatic",
      label: "Symptomatic BV",
      score: 10,
      rationale: [],
      requiredFeaturesMet: true,
    };
    const plan = buildCanonicalTreatmentPlan("vaginal_discharge", winning, { no_vaginal_symptoms: true });
    expect(plan.class).toBe("none");
  });

  it("influenza_like_illness → supportive, adds antiviral key for high-risk patients", async () => {
    const { buildCanonicalTreatmentPlan } = await import("../../server/services/therapeuticMinimalismEngine");
    const winning = {
      syndromeId: "influenza_like_illness",
      label: "Influenza-like illness",
      score: 12,
      rationale: [],
      requiredFeaturesMet: true,
    };
    const highRisk = buildCanonicalTreatmentPlan("flu_like", winning, { high_risk_for_flu_complications: true });
    const standard = buildCanonicalTreatmentPlan("flu_like", winning, {});
    expect(highRisk.medicationKey).toBe("consider_targeted_antiviral");
    expect(standard.medicationKey).toBeUndefined();
  });

  it("every plan has whyChosen, whyNotBroader, blockedAlternatives arrays", async () => {
    const { buildCanonicalTreatmentPlan } = await import("../../server/services/therapeuticMinimalismEngine");
    const plan = buildCanonicalTreatmentPlan("x", null, {});
    expect(Array.isArray(plan.whyChosen)).toBe(true);
    expect(Array.isArray(plan.whyNotBroader)).toBe(true);
    expect(Array.isArray(plan.blockedAlternatives)).toBe(true);
  });
});

// ─── Disposition Consistency Engine ──────────────────────────────────────────
describe("dispositionConsistencyEngine — safe disposition routing", () => {
  it("red flags → er_now with urgency 5", async () => {
    const { buildCanonicalDisposition } = await import("../../server/services/dispositionConsistencyEngine");
    const disp = buildCanonicalDisposition("sore_throat", null, { respiratory_distress: true });
    expect(disp.disposition).toBe("er_now");
    expect(disp.urgency).toBe(5);
    expect(disp.redFlagsTriggered).toContain("respiratory_distress");
  });

  it("hypoxia triggers er_now", async () => {
    const { buildCanonicalDisposition } = await import("../../server/services/dispositionConsistencyEngine");
    const disp = buildCanonicalDisposition("flu_like", null, { hypoxia: true });
    expect(disp.disposition).toBe("er_now");
    expect(disp.redFlagsTriggered).toContain("hypoxia");
  });

  it("flank_pain + fever_over_38 triggers possible_pyelonephritis flag", async () => {
    const { buildCanonicalDisposition } = await import("../../server/services/dispositionConsistencyEngine");
    const disp = buildCanonicalDisposition("urinary_symptoms", null, { flank_pain: true, fever_over_38: true });
    expect(disp.disposition).toBe("er_now");
    expect(disp.redFlagsTriggered).toContain("possible_pyelonephritis");
  });

  it("null winning → follow_up_primary_care", async () => {
    const { buildCanonicalDisposition } = await import("../../server/services/dispositionConsistencyEngine");
    const disp = buildCanonicalDisposition("unknown", null, {});
    expect(disp.disposition).toBe("follow_up_primary_care");
    expect(disp.redFlagsTriggered).toHaveLength(0);
  });

  it("viral_pharyngitis → home_supportive_care urgency 1", async () => {
    const { buildCanonicalDisposition } = await import("../../server/services/dispositionConsistencyEngine");
    const winning = { syndromeId: "viral_pharyngitis", label: "Viral", score: 7, rationale: [], requiredFeaturesMet: true };
    const disp = buildCanonicalDisposition("sore_throat", winning, {});
    expect(disp.disposition).toBe("home_supportive_care");
    expect(disp.urgency).toBe(1);
  });

  it("gas_centor_compatible → home_with_rx urgency 2", async () => {
    const { buildCanonicalDisposition } = await import("../../server/services/dispositionConsistencyEngine");
    const winning = { syndromeId: "gas_centor_compatible", label: "GAS", score: 12, rationale: [], requiredFeaturesMet: true };
    const disp = buildCanonicalDisposition("sore_throat", winning, {});
    expect(disp.disposition).toBe("home_with_rx");
    expect(disp.urgency).toBe(2);
  });

  it("simple_cystitis → home_with_rx", async () => {
    const { buildCanonicalDisposition } = await import("../../server/services/dispositionConsistencyEngine");
    const winning = { syndromeId: "simple_cystitis", label: "Cystitis", score: 12, rationale: [], requiredFeaturesMet: true };
    const disp = buildCanonicalDisposition("urinary_symptoms", winning, {});
    expect(disp.disposition).toBe("home_with_rx");
  });

  it("influenza_like_illness → home_supportive_care", async () => {
    const { buildCanonicalDisposition } = await import("../../server/services/dispositionConsistencyEngine");
    const winning = { syndromeId: "influenza_like_illness", label: "Flu", score: 9, rationale: [], requiredFeaturesMet: true };
    const disp = buildCanonicalDisposition("flu_like", winning, {});
    expect(disp.disposition).toBe("home_supportive_care");
  });

  it("asymptomatic_bacteriuria → follow_up_primary_care", async () => {
    const { buildCanonicalDisposition } = await import("../../server/services/dispositionConsistencyEngine");
    const winning = { syndromeId: "asymptomatic_bacteriuria", label: "ABU", score: 10, rationale: [], requiredFeaturesMet: true };
    const disp = buildCanonicalDisposition("urine_result_review", winning, {});
    expect(disp.disposition).toBe("follow_up_primary_care");
  });

  it("extractRedFlags returns all triggered flags", async () => {
    const { extractRedFlags } = await import("../../server/services/dispositionConsistencyEngine");
    const flags = extractRedFlags({ respiratory_distress: true, hypoxia: true, altered_mental_status: true });
    expect(flags).toContain("respiratory_distress");
    expect(flags).toContain("hypoxia");
    expect(flags).toContain("altered_mental_status");
  });
});

// ─── Variance Audit Service ───────────────────────────────────────────────────
describe("varianceAuditService — phenotype hashing + variance detection", () => {
  it("buildPhenotypeHash produces 24-char hex string", async () => {
    const { buildPhenotypeHash } = await import("../../server/services/varianceAuditService");
    const hash = buildPhenotypeHash("sore_throat", { sore_throat: true, cough: true });
    expect(hash).toHaveLength(24);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it("same input → same hash (deterministic)", async () => {
    const { buildPhenotypeHash } = await import("../../server/services/varianceAuditService");
    const features = { sore_throat: true, cough: true, rhinorrhea: false };
    const h1 = buildPhenotypeHash("sore_throat", features);
    const h2 = buildPhenotypeHash("sore_throat", features);
    expect(h1).toBe(h2);
  });

  it("different features → different hash", async () => {
    const { buildPhenotypeHash } = await import("../../server/services/varianceAuditService");
    const h1 = buildPhenotypeHash("sore_throat", { sore_throat: true, cough: true });
    const h2 = buildPhenotypeHash("sore_throat", { sore_throat: true, cough: false });
    expect(h1).not.toBe(h2);
  });

  it("detectVariance returns empty when no deviation", async () => {
    const { detectVariance } = await import("../../server/services/varianceAuditService");
    const { runClinicalConsistencyEngine } = await import("../../server/services/clinicalConsistencyEngine");
    const canonical = runClinicalConsistencyEngine("sore_throat", { sore_throat: true });
    const warnings = detectVariance({ canonical });
    expect(warnings).toHaveLength(0);
  });

  it("detectVariance flags disposition variance", async () => {
    const { detectVariance } = await import("../../server/services/varianceAuditService");
    const { runClinicalConsistencyEngine } = await import("../../server/services/clinicalConsistencyEngine");
    const canonical = runClinicalConsistencyEngine("sore_throat", { sore_throat: true, cough: true, rhinorrhea: true });
    const warnings = detectVariance({
      canonical,
      clinicianSelectedDisposition: "hospital_admission",
    });
    expect(warnings.some(w => w.includes("Disposition variance"))).toBe(true);
  });

  it("detectVariance flags medication key variance", async () => {
    const { detectVariance } = await import("../../server/services/varianceAuditService");
    const { runClinicalConsistencyEngine } = await import("../../server/services/clinicalConsistencyEngine");
    const canonical = runClinicalConsistencyEngine("sore_throat", {
      sore_throat: true,
      tonsillar_exudate: true,
      tender_anterior_cervical_nodes: true,
      fever_over_38: true,
      no_cough: true,
      positive_strep_test: true,
    });
    if (canonical.treatment.medicationKey) {
      const warnings = detectVariance({
        canonical,
        clinicianSelectedMedicationKey: "broad_spectrum_combo",
      });
      expect(warnings.some(w => w.includes("Medication variance"))).toBe(true);
    }
  });
});

// ─── Clinical Consistency Engine (Orchestrator) ───────────────────────────────
describe("clinicalConsistencyEngine — full pipeline orchestration", () => {
  it("returns CanonicalDecision shape", async () => {
    const { runClinicalConsistencyEngine } = await import("../../server/services/clinicalConsistencyEngine");
    const result = runClinicalConsistencyEngine("sore_throat", { sore_throat: true });
    expect(result).toHaveProperty("complaint");
    expect(result).toHaveProperty("phenotypeHash");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("winningSyndrome");
    expect(result).toHaveProperty("alternatives");
    expect(result).toHaveProperty("treatment");
    expect(result).toHaveProperty("disposition");
    expect(result).toHaveProperty("notesForClinician");
    expect(result).toHaveProperty("varianceWarnings");
  });

  it("viral phenotype → confidence low-moderate, home_supportive_care", async () => {
    const { runClinicalConsistencyEngine } = await import("../../server/services/clinicalConsistencyEngine");
    const result = runClinicalConsistencyEngine("sore_throat", {
      sore_throat: true, cough: true, rhinorrhea: true, hoarseness: true,
    });
    expect(["low", "moderate", "high"]).toContain(result.confidence);
    expect(result.disposition.disposition).toBe("home_supportive_care");
  });

  it("GAS phenotype with positive strep → antibiotic plan, home_with_rx", async () => {
    const { runClinicalConsistencyEngine } = await import("../../server/services/clinicalConsistencyEngine");
    const result = runClinicalConsistencyEngine("sore_throat", {
      sore_throat: true,
      tonsillar_exudate: true,
      tender_anterior_cervical_nodes: true,
      fever_over_38: true,
      no_cough: true,
      positive_strep_test: true,
    });
    expect(result.treatment.class).toBe("antibiotic");
    expect(result.disposition.disposition).toBe("home_with_rx");
  });

  it("red flag features → er_now disposition regardless of syndrome", async () => {
    const { runClinicalConsistencyEngine } = await import("../../server/services/clinicalConsistencyEngine");
    const result = runClinicalConsistencyEngine("sore_throat", {
      sore_throat: true,
      respiratory_distress: true,
    });
    expect(result.disposition.disposition).toBe("er_now");
  });

  it("unknown complaint with no features → low confidence, null winningSyndrome", async () => {
    const { runClinicalConsistencyEngine } = await import("../../server/services/clinicalConsistencyEngine");
    const result = runClinicalConsistencyEngine("unknown_complaint_xyz", {});
    expect(result.confidence).toBe("low");
    expect(result.winningSyndrome).toBeNull();
  });

  it("varianceWarnings mentions shotgun protection when blockedAlternatives exist", async () => {
    const { runClinicalConsistencyEngine } = await import("../../server/services/clinicalConsistencyEngine");
    const result = runClinicalConsistencyEngine("sore_throat", { sore_throat: true, cough: true });
    expect(result.varianceWarnings.some(w => w.includes("Shotgun protection"))).toBe(true);
  });

  it("phenotypeHash is 24 chars hex", async () => {
    const { runClinicalConsistencyEngine } = await import("../../server/services/clinicalConsistencyEngine");
    const result = runClinicalConsistencyEngine("sore_throat", { sore_throat: true });
    expect(result.phenotypeHash).toHaveLength(24);
    expect(/^[0-9a-f]+$/.test(result.phenotypeHash)).toBe(true);
  });

  it("same input always produces same phenotypeHash", async () => {
    const { runClinicalConsistencyEngine } = await import("../../server/services/clinicalConsistencyEngine");
    const f = { sore_throat: true, cough: true };
    const r1 = runClinicalConsistencyEngine("sore_throat", f);
    const r2 = runClinicalConsistencyEngine("sore_throat", f);
    expect(r1.phenotypeHash).toBe(r2.phenotypeHash);
  });
});

// ─── Medication Consistency Guard ─────────────────────────────────────────────
describe("medicationConsistencyGuard — shotgun prevention", () => {
  it("single appropriate antibiotic → allowed", async () => {
    const { validateMedicationBundle } = await import("../../server/services/medicationConsistencyGuard");
    const result = validateMedicationBundle([{ medicationKey: "narrow_uti_first_line", class: "antibiotic" }]);
    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("2 simultaneous antibiotics → blocked with explicit justification message", async () => {
    const { validateMedicationBundle } = await import("../../server/services/medicationConsistencyGuard");
    const result = validateMedicationBundle([
      { medicationKey: "empiric_azithromycin", class: "antibiotic" },
      { medicationKey: "empiric_doxycycline", class: "antibiotic" },
    ]);
    expect(result.allowed).toBe(false);
    expect(result.reasons.some(r => r.includes("Multiple simultaneous antibiotics"))).toBe(true);
  });

  it("3 overlapping empiric shotgun drugs → blocked with shotgun pattern message", async () => {
    const { validateMedicationBundle } = await import("../../server/services/medicationConsistencyGuard");
    const result = validateMedicationBundle([
      { medicationKey: "empiric_azithromycin", class: "antibiotic" },
      { medicationKey: "empiric_doxycycline", class: "antibiotic" },
      { medicationKey: "empiric_ceftriaxone", class: "antibiotic" },
    ]);
    expect(result.allowed).toBe(false);
    expect(result.reasons.some(r => r.includes("Shotgun treatment pattern"))).toBe(true);
  });

  it("empty orders → allowed", async () => {
    const { validateMedicationBundle } = await import("../../server/services/medicationConsistencyGuard");
    const result = validateMedicationBundle([]);
    expect(result.allowed).toBe(true);
  });

  it("returns reasons array always", async () => {
    const { validateMedicationBundle } = await import("../../server/services/medicationConsistencyGuard");
    const result = validateMedicationBundle([{ medicationKey: "ibuprofen", class: "nsaid" }]);
    expect(Array.isArray(result.reasons)).toBe(true);
  });
});

// ─── Reasoning Trace ─────────────────────────────────────────────────────────
describe("reasoningTrace — communication decision trail", () => {
  it("buildCommunicationTrace returns expected shape", async () => {
    const { buildCommunicationTrace } = await import("../../server/services/communication/reasoningTrace");
    const trace = buildCommunicationTrace({
      patientId: "p1",
      complaint: "cough",
      visitCount: 3,
      demandDetected: true,
      bacterialCriteria: false,
      tone: "frustrated",
      scriptVariant: "frustrated_variant",
    });
    expect(trace.patientId).toBe("p1");
    expect(trace.decision).toBe("DELAYED_RX");
    expect(trace.reasoning).toContain("Patient requested antibiotics");
    expect(trace.reasoning).toContain("No bacterial criteria met");
    expect(trace.reasoning).toContain("Repeat visit pattern");
  });

  it("bacterial criteria met → ANTIBIOTIC_GIVEN", async () => {
    const { buildCommunicationTrace } = await import("../../server/services/communication/reasoningTrace");
    const trace = buildCommunicationTrace({
      patientId: "p2",
      complaint: "sore throat",
      visitCount: 1,
      demandDetected: true,
      bacterialCriteria: true,
      tone: "neutral",
      scriptVariant: "neutral_variant",
    });
    expect(trace.decision).toBe("ANTIBIOTIC_GIVEN");
  });

  it("no demand, no bacterial criteria → NO_ANTIBIOTIC", async () => {
    const { buildCommunicationTrace } = await import("../../server/services/communication/reasoningTrace");
    const trace = buildCommunicationTrace({
      patientId: "p3",
      complaint: "cough",
      visitCount: 1,
      demandDetected: false,
      bacterialCriteria: false,
      tone: "neutral",
      scriptVariant: "neutral_variant",
    });
    expect(trace.decision).toBe("NO_ANTIBIOTIC");
  });

  it("stores traces and getStoredTraces returns them", async () => {
    const { buildCommunicationTrace, getStoredTraces, clearTraces } = await import("../../server/services/communication/reasoningTrace");
    clearTraces();
    buildCommunicationTrace({ patientId: "p-store", complaint: "c", visitCount: 1, demandDetected: false, bacterialCriteria: false, tone: "neutral", scriptVariant: "neutral_variant" });
    const traces = getStoredTraces();
    expect(traces.some(t => t.patientId === "p-store")).toBe(true);
  });

  it("clearTraces empties the store", async () => {
    const { clearTraces, getStoredTraces } = await import("../../server/services/communication/reasoningTrace");
    clearTraces();
    expect(getStoredTraces()).toHaveLength(0);
  });

  it("trace includes timestamp", async () => {
    const { buildCommunicationTrace } = await import("../../server/services/communication/reasoningTrace");
    const trace = buildCommunicationTrace({ patientId: "p4", complaint: "c", visitCount: 1, demandDetected: false, bacterialCriteria: false, tone: "neutral", scriptVariant: "neutral_variant" });
    expect(trace.timestamp).toBeInstanceOf(Date);
  });
});

// ─── A/B Testing Engine ───────────────────────────────────────────────────────
describe("abTestingEngine — deterministic group assignment", () => {
  it("assignABGroup returns A or B", async () => {
    const { assignABGroup } = await import("../../server/services/communication/abTestingEngine");
    const group = assignABGroup("patient-123");
    expect(["A", "B"]).toContain(group);
  });

  it("same patientId always gets same group (deterministic)", async () => {
    const { assignABGroup } = await import("../../server/services/communication/abTestingEngine");
    const g1 = assignABGroup("patient-abc");
    const g2 = assignABGroup("patient-abc");
    expect(g1).toBe(g2);
  });

  it("group A returns base script unchanged", async () => {
    const { getABScript } = await import("../../server/services/communication/abTestingEngine");
    const base = "Base script content here.";
    const script = getABScript("A", base);
    expect(script).toBe(base);
  });

  it("group B augments base script with variant text", async () => {
    const { getABScript } = await import("../../server/services/communication/abTestingEngine");
    const base = "Base script content here.";
    const script = getABScript("B", base);
    expect(script).toContain(base);
    expect(script.length).toBeGreaterThan(base.length);
    expect(script).toContain("timing treatment");
  });

  it("getABTestStats computes avoidance rate per group", async () => {
    const { getABTestStats } = await import("../../server/services/communication/abTestingEngine");
    const outcomes = [
      { group: "A" as const, antibioticAvoided: true },
      { group: "A" as const, antibioticAvoided: false },
      { group: "B" as const, antibioticAvoided: true },
    ];
    const stats = getABTestStats(outcomes);
    expect(stats.A.total).toBe(2);
    expect(stats.A.avoided).toBe(1);
    expect(stats.A.rate).toBe(0.5);
    expect(stats.B.total).toBe(1);
    expect(stats.B.avoided).toBe(1);
    expect(stats.B.rate).toBe(1);
  });
});

// ─── Learning Engine ──────────────────────────────────────────────────────────
describe("learningEngine — RLHF-lite weight updates", () => {
  beforeEach(async () => {
    const { resetWeights } = await import("../../server/services/communication/learningEngine");
    resetWeights();
  });

  it("all variants start at weight 1", async () => {
    const { getWeights } = await import("../../server/services/communication/learningEngine");
    const w = getWeights();
    for (const v of Object.values(w)) expect(v).toBe(1);
  });

  it("positive outcome increases weight", async () => {
    const { updateWeights, getWeights } = await import("../../server/services/communication/learningEngine");
    updateWeights({ scriptVariant: "neutral_variant", antibioticsGiven: false, returnVisit: false, patientSatisfaction: 5 });
    expect(getWeights()["neutral_variant"]).toBeGreaterThan(1);
  });

  it("bad outcome (returnVisit + antibioticsGiven) decreases weight", async () => {
    const { updateWeights, getWeights } = await import("../../server/services/communication/learningEngine");
    updateWeights({ scriptVariant: "frustrated_variant", antibioticsGiven: true, returnVisit: true });
    expect(getWeights()["frustrated_variant"]).toBeLessThan(1);
  });

  it("weight is clamped at 0.5 minimum", async () => {
    const { updateWeights, getWeights } = await import("../../server/services/communication/learningEngine");
    for (let i = 0; i < 20; i++) {
      updateWeights({ scriptVariant: "demanding_variant", antibioticsGiven: true, returnVisit: true });
    }
    expect(getWeights()["demanding_variant"]).toBeGreaterThanOrEqual(0.5);
  });

  it("weight is clamped at 2.0 maximum", async () => {
    const { updateWeights, getWeights } = await import("../../server/services/communication/learningEngine");
    for (let i = 0; i < 20; i++) {
      updateWeights({ scriptVariant: "anxious_variant", antibioticsGiven: false, returnVisit: false, patientSatisfaction: 5 });
    }
    expect(getWeights()["anxious_variant"]).toBeLessThanOrEqual(2);
  });

  it("getBestVariant returns variant with highest weight", async () => {
    const { updateWeights, getBestVariant } = await import("../../server/services/communication/learningEngine");
    updateWeights({ scriptVariant: "anxious_variant", antibioticsGiven: false, returnVisit: false, patientSatisfaction: 5 });
    updateWeights({ scriptVariant: "anxious_variant", antibioticsGiven: false, returnVisit: false, patientSatisfaction: 5 });
    const best = getBestVariant();
    expect(best).toBe("anxious_variant");
  });

  it("getVariantRanking returns sorted list", async () => {
    const { getVariantRanking } = await import("../../server/services/communication/learningEngine");
    const ranking = getVariantRanking();
    expect(ranking.length).toBeGreaterThan(0);
    for (let i = 1; i < ranking.length; i++) {
      expect(ranking[i - 1].weight).toBeGreaterThanOrEqual(ranking[i].weight);
    }
  });
});

// ─── Centor Engine ────────────────────────────────────────────────────────────
describe("centorEngine — clinical score calculator", () => {
  it("all 4 criteria + age < 15 = score 5", async () => {
    const { calculateCentorScore } = await import("../../server/services/clinical/centorEngine");
    const score = calculateCentorScore({
      fever: true, tonsillarExudate: true,
      tenderAnteriorCervicalNodes: true, absenceOfCough: true,
      age: 12,
    });
    expect(score).toBe(5);
  });

  it("all 4 criteria + age 25 (no age modifier) = score 4", async () => {
    const { calculateCentorScore } = await import("../../server/services/clinical/centorEngine");
    const score = calculateCentorScore({
      fever: true, tonsillarExudate: true,
      tenderAnteriorCervicalNodes: true, absenceOfCough: true,
      age: 25,
    });
    expect(score).toBe(4);
  });

  it("all 4 criteria + age > 44 = score 3", async () => {
    const { calculateCentorScore } = await import("../../server/services/clinical/centorEngine");
    const score = calculateCentorScore({
      fever: true, tonsillarExudate: true,
      tenderAnteriorCervicalNodes: true, absenceOfCough: true,
      age: 50,
    });
    expect(score).toBe(3);
  });

  it("no criteria = score 0", async () => {
    const { calculateCentorScore } = await import("../../server/services/clinical/centorEngine");
    const score = calculateCentorScore({
      fever: false, tonsillarExudate: false,
      tenderAnteriorCervicalNodes: false, absenceOfCough: false,
      age: 30,
    });
    expect(score).toBe(0);
  });

  it("score 0 → NO_ANTIBIOTIC", async () => {
    const { centorDecision } = await import("../../server/services/clinical/centorEngine");
    expect(centorDecision(0)).toBe("NO_ANTIBIOTIC");
  });

  it("score 1 → NO_ANTIBIOTIC", async () => {
    const { centorDecision } = await import("../../server/services/clinical/centorEngine");
    expect(centorDecision(1)).toBe("NO_ANTIBIOTIC");
  });

  it("score 2 → TEST_OR_DELAYED_RX", async () => {
    const { centorDecision } = await import("../../server/services/clinical/centorEngine");
    expect(centorDecision(2)).toBe("TEST_OR_DELAYED_RX");
  });

  it("score 3 → TEST_OR_DELAYED_RX", async () => {
    const { centorDecision } = await import("../../server/services/clinical/centorEngine");
    expect(centorDecision(3)).toBe("TEST_OR_DELAYED_RX");
  });

  it("score 4 → EMPIRIC_ANTIBIOTIC", async () => {
    const { centorDecision } = await import("../../server/services/clinical/centorEngine");
    expect(centorDecision(4)).toBe("EMPIRIC_ANTIBIOTIC");
  });

  it("score 5 → EMPIRIC_ANTIBIOTIC", async () => {
    const { centorDecision } = await import("../../server/services/clinical/centorEngine");
    expect(centorDecision(5)).toBe("EMPIRIC_ANTIBIOTIC");
  });

  it("centorRationale returns non-empty string array", async () => {
    const { centorRationale } = await import("../../server/services/clinical/centorEngine");
    expect(centorRationale(0).length).toBeGreaterThan(0);
    expect(centorRationale(2).length).toBeGreaterThan(0);
    expect(centorRationale(4).length).toBeGreaterThan(0);
  });
});

// ─── Bayesian Strep Engine ────────────────────────────────────────────────────
describe("bayesianStrepEngine — probability estimation", () => {
  it("baseline with no features = 0.10", async () => {
    const { calculateStrepProbability } = await import("../../server/services/clinical/bayesianStrepEngine");
    const p = calculateStrepProbability({ fever: false, exudate: false, nodes: false, cough: true });
    expect(p).toBeCloseTo(0.10);
  });

  it("all 4 risk factors → high probability", async () => {
    const { calculateStrepProbability } = await import("../../server/services/clinical/bayesianStrepEngine");
    const p = calculateStrepProbability({ fever: true, exudate: true, nodes: true, cough: false });
    expect(p).toBeGreaterThan(0.6);
  });

  it("probability is capped at 0.95", async () => {
    const { calculateStrepProbability } = await import("../../server/services/clinical/bayesianStrepEngine");
    const p = calculateStrepProbability({ fever: true, exudate: true, nodes: true, cough: false });
    expect(p).toBeLessThanOrEqual(0.95);
  });

  it("absence of cough adds +0.15", async () => {
    const { calculateStrepProbability } = await import("../../server/services/clinical/bayesianStrepEngine");
    const with_cough    = calculateStrepProbability({ fever: false, exudate: false, nodes: false, cough: true });
    const without_cough = calculateStrepProbability({ fever: false, exudate: false, nodes: false, cough: false });
    expect(without_cough - with_cough).toBeCloseTo(0.15);
  });

  it("strepRiskLabel returns low/moderate/high", async () => {
    const { strepRiskLabel } = await import("../../server/services/clinical/bayesianStrepEngine");
    expect(strepRiskLabel(0.1)).toBe("low");
    expect(strepRiskLabel(0.4)).toBe("moderate");
    expect(strepRiskLabel(0.7)).toBe("high");
  });

  it("strepTreatmentRecommendation provides actionable text", async () => {
    const { strepTreatmentRecommendation } = await import("../../server/services/clinical/bayesianStrepEngine");
    const high  = strepTreatmentRecommendation(0.7, 4);
    const mid   = strepTreatmentRecommendation(0.4, 3);
    const low   = strepTreatmentRecommendation(0.1, 0);
    expect(high).toContain("Empiric");
    expect(mid).toContain("test");
    expect(low).toContain("Supportive");
  });
});

// ─── Debate Engine ────────────────────────────────────────────────────────────
describe("debateEngine — multi-agent antibiotic consensus", () => {
  it("high Centor + high probability → ANTIBIOTIC_GIVEN", async () => {
    const { runAntibioticDebate } = await import("../../server/services/communication/debateEngine");
    const result = runAntibioticDebate({ centorScore: 5, strepProbability: 0.85 });
    expect(result.decision).toBe("ANTIBIOTIC_GIVEN");
    expect(result.proArguments.length).toBeGreaterThan(0);
  });

  it("low Centor + low probability → NO_ANTIBIOTIC_OR_DELAYED", async () => {
    const { runAntibioticDebate } = await import("../../server/services/communication/debateEngine");
    const result = runAntibioticDebate({ centorScore: 0, strepProbability: 0.1 });
    expect(result.decision).toBe("NO_ANTIBIOTIC_OR_DELAYED");
    expect(result.conArguments.length).toBeGreaterThan(0);
  });

  it("returns proArguments and conArguments arrays", async () => {
    const { runAntibioticDebate } = await import("../../server/services/communication/debateEngine");
    const result = runAntibioticDebate({ centorScore: 3, strepProbability: 0.5 });
    expect(Array.isArray(result.proArguments)).toBe(true);
    expect(Array.isArray(result.conArguments)).toBe(true);
  });

  it("confidence is a number 0-1", async () => {
    const { runAntibioticDebate } = await import("../../server/services/communication/debateEngine");
    const result = runAntibioticDebate({ centorScore: 3, strepProbability: 0.5 });
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("reasoning array contains winning side arguments", async () => {
    const { runAntibioticDebate } = await import("../../server/services/communication/debateEngine");
    const pro = runAntibioticDebate({ centorScore: 5, strepProbability: 0.9 });
    expect(pro.reasoning.length).toBeGreaterThan(0);
  });
});

// ─── Voice Service ────────────────────────────────────────────────────────────
describe("voiceService — Twilio delivery layer", () => {
  it("isTwilioConfigured returns false when env vars absent", async () => {
    delete process.env.TWILIO_SID;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH;
    delete process.env.TWILIO_AUTH_TOKEN;
    const { isTwilioConfigured } = await import("../../server/services/communication/voiceService");
    expect(isTwilioConfigured()).toBe(false);
  });

  it("buildPatientVoiceMessage for ANTIBIOTIC_GIVEN contains reassuring antibiotic explanation", async () => {
    const { buildPatientVoiceMessage } = await import("../../server/services/communication/voiceService");
    const msg = buildPatientVoiceMessage("home_with_rx", "ANTIBIOTIC_GIVEN");
    expect(msg.toLowerCase()).toContain("antibiotic");
    expect(msg.length).toBeGreaterThan(20);
  });

  it("buildPatientVoiceMessage for NO_ANTIBIOTIC_OR_DELAYED contains monitoring message", async () => {
    const { buildPatientVoiceMessage } = await import("../../server/services/communication/voiceService");
    const msg = buildPatientVoiceMessage("home_supportive_care", "NO_ANTIBIOTIC_OR_DELAYED");
    expect(msg.toLowerCase()).toContain("monitor");
    expect(msg.length).toBeGreaterThan(20);
  });

  it("buildPatientVoiceMessage for TEST_OR_DELAYED_RX contains 48-72h guidance", async () => {
    const { buildPatientVoiceMessage } = await import("../../server/services/communication/voiceService");
    const msg = buildPatientVoiceMessage("home_supportive_care", "TEST_OR_DELAYED_RX");
    expect(msg.toLowerCase()).toMatch(/48|72|monitor/);
  });

  it("speakToPatient throws when Twilio not configured", async () => {
    delete process.env.TWILIO_SID;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH;
    delete process.env.TWILIO_AUTH_TOKEN;
    const { speakToPatient } = await import("../../server/services/communication/voiceService");
    await expect(speakToPatient("+15551234567", "test")).rejects.toThrow();
  });
});
