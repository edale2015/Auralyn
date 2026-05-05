import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

function deriveSystem(id: string): string {
  const s = id.toLowerCase();

  // Explicit prefixes — highest priority
  if (s.startsWith("der_") || s.startsWith("derm_")) return "Dermatology";
  if (s.startsWith("gu_") || s.startsWith("urogyn")) return "UroGyn";
  if (s.startsWith("gi_")) return "Gastroenterology";
  if (s.startsWith("pulm_")) return "Pulmonology";
  if (s.startsWith("neuro_")) return "Neurology";
  if (s.startsWith("ent_")) return "ENT";
  if (s.startsWith("msk_")) return "Musculoskeletal";
  if (s.startsWith("cardio")) return "Cardiology";
  if (s.startsWith("id_")) return "Infectious Disease";
  if (s.startsWith("tox")) return "Toxicology";
  if (s.startsWith("gyn_") || s.startsWith("ob_")) return "Gynecology";

  // Dermatology
  if (s.includes("rash") || s.includes("skin") || s.includes("eczema") || s.includes("psoriasis") || s.includes("melanoma") || s.includes("urticaria") || s.includes("shingles") || s.includes("contact_derm") || s.includes("hair_scalp") || s.includes("nail_") || s.includes("acne") || s.includes("impetigo") || s.includes("cellulitis") || s.includes("wound") || s.includes("burn") || s.includes("fungal")) return "Dermatology";

  // GI / Gastroenterology
  if (s.includes("abdominal") || s.includes("nausea") || s.includes("vomit") || s.includes("bowel") || s.includes("hepat") || s.includes("gallbladder") || s.includes("rectal") || s.includes("diarrhea") || s.includes("gastro") || s.includes("jaundice") || s.includes("pancreat") || s.includes("epigastric") || s.includes("constipation") || s.includes("llq_pain") || s.includes("rlq_pain") || s.includes("ruq_pain") || s.includes("luq_pain") || s.includes("gi_") || s.includes("colitis") || s.includes("ibs") || s.includes("hernia") || s.includes("appendic") || s.includes("periton")) return "Gastroenterology";

  // Pulmonology
  if (s.includes("cough") || s.includes("asthma") || s.includes("copd") || s.includes("breath") || s.includes("pneumon") || s.includes("hemoptysis") || s.includes("bronch") || s.includes("wheezing") || s.includes("stridor") || s.includes("pleural") || s.includes("embolism") || s.includes("pe_")) return "Pulmonology";

  // Neurology
  if (s.includes("headache") || s.includes("seizure") || s.includes("stroke") || s.includes("dizz") || s.includes("vertigo") || s.includes("weakness") || s.includes("migraine") || s.includes("bells") || s.includes("concussion") || s.includes("meningit") || s.includes("altered_mental") || s.includes("numbness") || s.includes("tia_") || s.includes("parkinson") || s.includes("tremor")) return "Neurology";

  // ENT
  if (s.includes("earache") || s.includes("ear_pain") || s.includes("throat") || s.includes("sinus") || s.includes("hoarse") || s.includes("swallow") || s.includes("nosebleed") || s.includes("epistaxis") || s.includes("nasal") || s.includes("neck_swelling") || s.includes("hearing_loss") || s.includes("neck_mass") || s.includes("tonsil") || s.includes("larynx") || s.includes("vocal")) return "ENT";

  // Musculoskeletal
  if (s.includes("back_pain") || s.includes("neck_pain") || s.includes("shoulder") || s.includes("knee") || s.includes("ankle") || s.includes("hip") || s.includes("elbow") || s.includes("hand_pain") || s.includes("foot_pain") || s.includes("wrist") || s.includes("fracture") || s.includes("joint") || s.includes("compartment") || s.includes("arm_forearm") || s.includes("muscle_pain") || s.includes("tendon") || s.includes("ligament") || s.includes("sprain") || s.includes("arthrit")) return "Musculoskeletal";

  // Cardiology
  if (s.includes("cardiac") || s.includes("chest_pain") || s.includes("palpitat") || s.includes("syncope") || s.includes("dvt") || s.includes("afib") || s.includes("hypertens") || s.includes("heart_fail") || s.includes("leg_swelling") || s.includes("aortic") || s.includes("coronary") || s.includes("angina")) return "Cardiology";

  // Endocrinology
  if (s.includes("hyperglycemia") || s.includes("hypoglycemia") || s.includes("thyroid") || s.includes("adrenal") || s.includes("obesity") || s.includes("diabetes") || s.includes("endocrin") || s.includes("dehydrat") || s.includes("electrolyte") || s.includes("bariatric") || s.includes("metabol") || s.includes("weight_gain") || s.includes("insomnia")) return "Endocrinology";

  // UroGyn — urinary / gynecologic
  if (s.includes("urinary") || s.includes("uti") || s.includes("kidney") || s.includes("renal") || s.includes("testicular") || s.includes("flank_pain") || s.includes("hematuria") || s.includes("pelvic_pain") || s.includes("vaginal") || s.includes("prostat") || s.includes("bladder") || s.includes("incontinence") || s.includes("urogyn") || s.includes("genital_symptom") || s.includes("female_pelvic")) return "UroGyn";

  // Gynecology
  if (s.includes("pregnancy") || s.includes("ectopic") || s.includes("ovarian") || s.includes("dysmenorrhea") || s.includes("breast") || s.includes("pid") || s.includes("menstrual") || s.includes("obstet")) return "Gynecology";

  // Infectious Disease
  if (s.includes("fever") || s.includes("sepsis") || s.includes("lyme") || s.includes("mono") || s.includes("hiv") || s.includes("travel") || s.includes("infectious") || s.includes("influenza") || s.includes("covid") || s.includes("tuberculosis") || s.includes("malaria")) return "Infectious Disease";

  // Psychiatry
  if (s.includes("psych") || s.includes("anxiety") || s.includes("depression") || s.includes("suicid") || s.includes("psychosis") || s.includes("substance") || s.includes("alcohol_withdrawal") || s.includes("panic") || s.includes("bipolar") || s.includes("schiz")) return "Psychiatry";

  // Pediatrics
  if (s.includes("pediatric") || s.includes("childhood") || s.includes("kawasaki") || s.includes("croup") || s.includes("febrile_seizure") || s.includes("epiglott") || s.includes("intussus") || s.includes("rsv")) return "Pediatrics";

  // Hematology
  if (s.includes("anemia") || s.includes("anticoagul") || s.includes("sickle") || s.includes("neutropenic") || s.includes("lymph") || s.includes("hemato") || s.includes("hematology")) return "Hematology";

  // Ophthalmology
  if (s.includes("eye") || s.includes("vision") || s.includes("pink_eye") || s.includes("conjunct") || s.includes("periorbital") || s.includes("double_vision") || s.includes("ophthalm") || s.includes("glaucom") || s.includes("retina")) return "Ophthalmology";

  // Toxicology
  if (s.includes("overdose") || s.includes("opioid") || s.includes("carbon_mono") || s.includes("drug_react") || s.includes("poison") || s.includes("toxic")) return "Toxicology";

  // Trauma
  if (s.includes("trauma") || s.includes("lacerat") || s.includes("bite_wound") || s.includes("foreign_body") || s.includes("spinal_injur") || s.includes("chest_trauma") || s.includes("head_trauma") || s.includes("abdominal_trauma") || s.includes("facial_trauma")) return "Trauma";

  // Allergy
  if (s.includes("anaphylax") || s.includes("allergic") || s.includes("drug_allergy") || s.includes("food_allergy") || s.includes("insect_sting") || s.includes("insect_bite") || s.includes("allergic_rhinitis")) return "Allergy";

  // Sexual Health
  if (s.includes("std_") || s.includes("gonorrhea") || s.includes("syphilis") || s.includes("herpes") || s.includes("epididymitis") || s.includes("prep_") || s.includes("sexual")) return "Sexual Health";

  // Dental
  if (s.includes("dental") || s.includes("tooth") || s.includes("oral_") || s.includes("trismus")) return "Dental";

  // Environmental / General
  if (s.includes("heat_exhaust") || s.includes("hypothermia") || s.includes("lightning") || s.includes("cold_exposure") || s.includes("heat_exposure") || s.includes("environ") || s.includes("frostbite")) return "Environmental";

  // General / Other
  if (s.includes("fatigue") || s.includes("malaise") || s.includes("fall_elderly") || s.includes("workers_comp") || s.includes("medication_refill") || s.includes("vascular") || s.includes("general") || s.includes("systemic") || s.includes("bayesian") || s.includes("global")) return "General";

  return "Other";
}

// GET /api/kb-editor/complaints
// Returns all complaints with rule counts per type + derived system
router.get("/complaints", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        complaint_id,
        COUNT(*) FILTER (WHERE rule_type = 'diagnosis')       AS dx_count,
        COUNT(*) FILTER (WHERE rule_type = 'workup')          AS workup_count,
        COUNT(*) FILTER (WHERE rule_type = 'medication')      AS med_count,
        COUNT(*) FILTER (WHERE rule_type = 'disposition')     AS disp_count,
        COUNT(*) FILTER (WHERE rule_type = 'question')        AS q_count,
        COUNT(*) FILTER (WHERE rule_type = 'modifier')        AS mod_count,
        COUNT(*) FILTER (WHERE rule_type = 'red_flag')        AS rf_count,
        COUNT(*) FILTER (WHERE rule_type = 'cluster_scoring') AS score_count,
        COUNT(*) AS total
      FROM kb_master_rules
      WHERE active = true
        AND complaint_id IS NOT NULL
        AND complaint_id != ''
        AND complaint_id != 'ALL'
      GROUP BY complaint_id
      ORDER BY total DESC
    `);

    const complaints = (rows.rows as any[]).map((r) => ({
      ...r,
      system: deriveSystem(r.complaint_id),
    }));

    res.json({ complaints });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/kb-editor/rules?complaint_id=X&rule_type=Y&page=1&limit=50
router.get("/rules", async (req, res) => {
  const { complaint_id, rule_type, page = "1", limit = "50", search } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const searchClause = search ? sql`AND (rule_name ILIKE ${"%" + search + "%"} OR logic_description ILIKE ${"%" + search + "%"})` : sql``;
    const typeClause   = rule_type && rule_type !== "all" ? sql`AND rule_type = ${rule_type}` : sql``;
    const ccClause     = complaint_id ? sql`AND complaint_id = ${complaint_id}` : sql``;

    const rows = await db.execute(sql`
      SELECT *
      FROM kb_master_rules
      WHERE active = true
        ${ccClause}
        ${typeClause}
        ${searchClause}
      ORDER BY priority ASC, rule_name ASC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `);

    const countRes = await db.execute(sql`
      SELECT COUNT(*) as cnt
      FROM kb_master_rules
      WHERE active = true
        ${ccClause}
        ${typeClause}
        ${searchClause}
    `);

    res.json({
      rules: rows.rows,
      total: parseInt((countRes.rows[0] as any).cnt),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/kb-editor/rules — create a new rule
router.post("/rules", async (req, res) => {
  const b = req.body;
  if (!b.rule_name || !b.rule_type || !b.complaint_id) {
    return res.status(400).json({ error: "rule_name, rule_type, complaint_id required" });
  }

  const validTypes = ["red_flag","diagnosis","cluster_scoring","medication","disposition","question","modifier","workup","plan"];
  const validLevels = ["LOW","MODERATE","HIGH","CRITICAL"];
  const validLogic  = ["boolean","scoring","threshold","mapping","conditional","ML"];
  if (!validTypes.includes(b.rule_type))   return res.status(400).json({ error: "Invalid rule_type" });
  if (b.safety_level && !validLevels.includes(b.safety_level)) return res.status(400).json({ error: "Invalid safety_level" });

  const ruleId = `manual_${Date.now()}_${b.rule_type.slice(0,3)}`;

  try {
    await db.execute(sql`
      INSERT INTO kb_master_rules
        (rule_id, rule_name, rule_type, priority, complaint_id, cluster_id, diagnosis_id,
         logic_description, logic_type, source_tab,
         disposition_impact, medication_impact, workup_impact,
         safety_level, notes, active, version, owner)
      VALUES (
        ${ruleId}, ${b.rule_name}, ${b.rule_type}, ${b.priority ?? 5},
        ${b.complaint_id}, ${b.cluster_id ?? null}, ${b.diagnosis_id ?? null},
        ${b.logic_description ?? null},
        ${validLogic.includes(b.logic_type) ? b.logic_type : "boolean"},
        ${"manual"},
        ${b.disposition_impact ?? null}, ${b.medication_impact ?? null}, ${b.workup_impact ?? null},
        ${b.safety_level ?? "MODERATE"}, ${b.notes ?? null},
        true, 'v2', 'physician_edit'
      )
    `);
    res.json({ success: true, rule_id: ruleId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/kb-editor/rules/:rule_id — update a rule
router.patch("/rules/:rule_id", async (req, res) => {
  const { rule_id } = req.params;
  const b = req.body;

  const validLevels = ["LOW","MODERATE","HIGH","CRITICAL"];
  const validLogic  = ["boolean","scoring","threshold","mapping","conditional","ML"];

  try {
    await db.execute(sql`
      UPDATE kb_master_rules SET
        rule_name          = COALESCE(${b.rule_name          ?? null}, rule_name),
        priority           = COALESCE(${b.priority           ?? null}, priority),
        complaint_id       = COALESCE(${b.complaint_id       ?? null}, complaint_id),
        cluster_id         = COALESCE(${b.cluster_id         ?? null}, cluster_id),
        diagnosis_id       = COALESCE(${b.diagnosis_id       ?? null}, diagnosis_id),
        logic_description  = ${b.logic_description  !== undefined ? b.logic_description  : sql`logic_description`},
        logic_type         = COALESCE(${validLogic.includes(b.logic_type) ? b.logic_type : null}, logic_type),
        disposition_impact = ${b.disposition_impact !== undefined ? b.disposition_impact : sql`disposition_impact`},
        medication_impact  = ${b.medication_impact  !== undefined ? b.medication_impact  : sql`medication_impact`},
        workup_impact      = ${b.workup_impact      !== undefined ? b.workup_impact      : sql`workup_impact`},
        safety_level       = COALESCE(${validLevels.includes(b.safety_level) ? b.safety_level : null}, safety_level),
        notes              = ${b.notes !== undefined ? b.notes : sql`notes`},
        active             = COALESCE(${b.active !== undefined ? b.active : null}, active),
        version            = 'v2',
        last_updated       = NOW()
      WHERE rule_id = ${rule_id}
    `);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/kb-editor/rules/:rule_id — soft delete
router.delete("/rules/:rule_id", async (req, res) => {
  try {
    await db.execute(sql`
      UPDATE kb_master_rules SET active = false, last_updated = NOW()
      WHERE rule_id = ${req.params.rule_id}
    `);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
