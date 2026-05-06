import { Router } from "express";
import { query } from "../db";
import { requireRole } from "../middleware/requireRole";
import { requireReviewAuth } from "../middleware/reviewAuth";

const router = Router();
const auth = [requireReviewAuth, requireRole(["admin", "physician"])];

// ── 30-system classifier ──────────────────────────────────────────────────────
function getSystem(id: string): string {
  if (/^car_|^card_|^cardio_|^cardiology$|chest_pain|palpitation|syncope|^young_with_severe_htn|episodic_hypertension|abdominal_discomfort_and_rapid_heart_rate|^60_and_le_ischemia$/.test(id)) return "Cardiovascular";
  if (/^pulm_|cough|shortness_of_breath|wheez|hemoptysis|atypical_pneumonia|barking_cough|whooping_cough|bad_cough|respiratory_symptoms|^chest_pain_pulmonary/.test(id)) return "Pulmonology";
  if (/^gi_|^abdominal|constipation|diarrhea|vomiting|dysphagia|jaundice|epigastric|hernia|bloody_diarrhea|^upper_gi|^65_and_llq|watery_diarrhea|decreased_urination_and_tender|abdominal_scar/.test(id)) return "GI";
  if (/^ent_|sore_throat|^a_sore_throat|ear_pain|epistaxis|hoarseness|stridor|angular_cheilitis|^uvula|black_hairy_tongue|burning_mouth|aphthous|angle_of_jaw|blue_ball_near_the_entrance|allergic_rhinitis|^barking_cough$/.test(id)) return "ENT";
  if (/^gyn_|^breast_|^vaginal|^vulvar|^female_|^woman_with|^ambiguous_genitalia|^urogyn$|^pelvic_pain|menstrual|pregnancy|^abdominal_pelvic_pain$/.test(id)) return "OB/Gyn";
  if (/^gu_|^uro_|testicular|^urinary|^uti_|hematuria|flank_|^blood_in_the_urine|^bloody_urine|^urinary_burning|^urinary_symptoms|^erectile_dysfunction|^back_pain_and_pain_with_urination|^back_pain_and_testicle/.test(id)) return "GU/Urology";
  if (/headache|dizziness|vertigo|seizure|^focal_deficit|confusion|^neuro_|^bell_s_palsy|weakness_neuro|head_trauma|^weakness_in_one_side|^acute_focal_deficit|^weakness_in_one_side_of_the_face/.test(id)) return "Neurology";
  if (/back_pain|joint_pain|shoulder_pain|elbow_pain|^ankle|foot_pain|hip_pain|^wrist|^arm_forearm|^msk_|^knee|bone_pain|^18_forearm|^1st_toe|^65_and_back|^back_or_neck|bottom_of_the_foot|^calf_pain|^cant_move_finger|^cant_pinch|^cant_straighten|^child_wont_move_arm|^fall_on_outstretched|^feel_pulse_under_fingernail|^fell_on_ribs|^finger_|^acute_joint_pain|^dental_pain/.test(id)) return "MSK/Ortho";
  if (/^derm_|^acute_rash$|^rash$|skin_|cellulitis|^acne|^baby_red_rash|^central_dimple|^bleeding_in_a_rash|^burning_stinging|^face_red_bumps|^yellow_crust|^white_wisps|^blisters$|^blister_on_red_skin|^vessicle|^balls_of_clear/.test(id)) return "Dermatology";
  if (/^endo_|diabetes|hyperglycemia|hypoglycemia|thyroid|^adrenal|weight_manag|eating_disorder|^borderline_high_sugars|^exercise_related_lows|^weight_gain_bruising|weight_loss_palpitations|weight_loss_hypoglycemia/.test(id)) return "Endocrine/Metabolic";
  if (/^allg_|^allergic$|^anaphylaxis$|^angioedema|^allg_urticaria|^autoimmune$/.test(id)) return "Allergy/Immunology";
  if (/^eye_|^eyelid|cornea|conjunctiva|^vision_changes$|^chronic_gritty_eye|^bump_on_the_conjunctiva|^whole_lid_swelling|^eye_pain_after_snow|^eye_trauma/.test(id)) return "Ophthalmology";
  if (/^id_|^fever$|^fever_|^animal_bite|^cat_bite|^bite_sting|^bite_wound|^arthropod|^tick|^snake|^spider|infestation|^febrile_neutro|^childhood_fever|^bone_pain_with_fever|^back_pain_with_fever|^fever_and_|fever,/.test(id)) return "Infectious Disease";
  if (/^environmental_|^altitude|^avalanche|^cold_and_wet|^cold_exposure|^cold_injury|^cryogenic|^uv_exposure|^heat_|^air_pollutant$|^airborne|^falling_debris|^fire$|^water_exposure/.test(id)) return "Environmental";
  if (/^agricultural_gas|^arc_welding|^building_material|^chemical_|^confined_space|^contaminated_water|^voc_rich|^blast|^burn_inhalation|^burn_major|^burn_electrical|^co_exposure|^carbon_monoxide/.test(id)) return "Occupational/Industrial";
  if (/^tox_|^alcohol_withdrawal|^withdrawal$|substance_use|drug_reaction|^chemical_vapor|^chemical_spill|^child_ingestion|^well_water|^excessive_secretions|^agitated_sweaty|^agitated_tachycardic|^poison/.test(id)) return "Toxicology";
  if (/^anxiety|^depression|^insomnia|psychiatric|anxiety_sleep/.test(id)) return "Psychiatry";
  if (/^cut$|^cut_and|^crush_injury|^vascular_catastrophe|^vascular_emergency|^upper_gi_emergency|^abdominal_trauma|^critical_emergency/.test(id)) return "Trauma/Emergency";
  if (/^burn$|^burn_minor|^burn_partial|^burned_skin|^charred|^blistering_partial|^blister_on_red_skin$/.test(id)) return "Wound/Burns";
  if (/^child_|^ankle_pain_in_child|^vaginal_discomfort_or_discharge_in_12_yo$|^childhood_fever/.test(id)) return "Pediatrics";
  if (/^bleeding$|^ALL$|^bone_pain_fractures|^fatigue_anemia|^hemorrhage/.test(id)) return "Hematology";
  if (/^vascular_/.test(id)) return "Vascular";
  if (/^weight_loss$|^weight_management$|^fatigue_weight_gain/.test(id)) return "Weight/Nutrition";
  if (/^general_|^asymptomatic|^chronic_symptoms|^chief_complaint|^bayesian_global/.test(id)) return "General";
  if (/^fatigue/.test(id)) return "General";
  return "Other";
}

// ── Label prettifier ──────────────────────────────────────────────────────────
function prettifyLabel(id: string): string {
  const prefixMap: [string, string][] = [
    ["gi_", "GI: "], ["gyn_", "Gyn: "],
    ["cardio_", "Cardio: "], ["card_", "Cardio: "], ["car_", "Cardio: "],
    ["ent_", "ENT: "], ["gu_", "GU: "], ["uro_", "Uro: "],
    ["endo_", "Endo: "], ["derm_", "Derm: "], ["id_", "ID: "],
    ["neuro_", "Neuro: "], ["msk_", "MSK: "], ["pulm_", "Pulm: "],
    ["allg_", "Allergy: "], ["environmental_", "Env: "], ["tox_", "Tox: "],
    ["general_", "General: "],
  ];
  for (const [prefix, display] of prefixMap) {
    if (id.startsWith(prefix)) {
      const rest = id.slice(prefix.length).replace(/_/g, " ");
      return display + rest.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  // Shorten excessively long natural-language IDs
  const label = id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return label.length > 60 ? label.slice(0, 57) + "…" : label;
}

// ── GET /api/encounter-configs
//    ?full=true  → all 1,000+ complaints from kb_master_rules
//    (default)   → complaints with ≥1 diagnosis from kb_diagnosis_rules
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", ...auth, async (req, res) => {
  try {
    const full = req.query.full === "true";

    let rows: any[];

    if (full) {
      const result = await query(`
        SELECT
          m.complaint_id,
          COUNT(*) FILTER (WHERE m.rule_type = 'diagnosis')  AS dx_count,
          COUNT(*) FILTER (WHERE m.rule_type = 'red_flag')   AS rf_count,
          COUNT(*) FILTER (WHERE m.rule_type = 'workup')     AS wu_count,
          COUNT(*)                                            AS rule_count
        FROM kb_master_rules m
        WHERE m.active = true
        GROUP BY m.complaint_id
        ORDER BY m.complaint_id
      `);
      rows = result.rows;
    } else {
      const result = await query(`
        SELECT
          d.complaint_id,
          COUNT(DISTINCT d.id) AS dx_count,
          COUNT(DISTINCT r.id) AS rf_count,
          0                    AS wu_count,
          COUNT(DISTINCT d.id) AS rule_count
        FROM kb_diagnosis_rules d
        LEFT JOIN kb_red_flag_rules r ON r.complaint_id = d.complaint_id
        WHERE d.active = true
        GROUP BY d.complaint_id
        HAVING COUNT(DISTINCT d.id) >= 1
        ORDER BY d.complaint_id
      `);
      rows = result.rows;
    }

    res.json(
      rows
      .filter((row: any) => row.complaint_id && typeof row.complaint_id === "string")
      .map((row: any) => ({
        id: row.complaint_id,
        label: prettifyLabel(row.complaint_id),
        system: getSystem(row.complaint_id),
        dxCount: parseInt(row.dx_count) || 0,
        rfCount: parseInt(row.rf_count) || 0,
        ruleCount: parseInt(row.rule_count) || 0,
        full,
      }))
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/encounter-configs/:complaint_id — dynamic config from KB ─────────
router.get("/:complaint_id", ...auth, async (req, res) => {
  const { complaint_id } = req.params;
  try {
    const [dxRes, rfRes, qRes, dispRes, workupRes] = await Promise.all([
      query(
        `SELECT diagnosis_id, diagnosis_label, icd_code, cannot_miss, base_probability
         FROM kb_diagnosis_rules WHERE complaint_id = $1 AND active = true
         ORDER BY cannot_miss DESC, base_probability DESC LIMIT 15`,
        [complaint_id]
      ),
      query(
        `SELECT rule_id, label, severity, action, trigger_expr
         FROM kb_red_flag_rules WHERE complaint_id = $1 AND active = true
         ORDER BY severity LIMIT 20`,
        [complaint_id]
      ),
      query(
        `SELECT question_key, category, display_text, red_flag_weight, required
         FROM kb_question_logic WHERE complaint_id = $1 AND is_active = true
         ORDER BY red_flag_weight DESC LIMIT 40`,
        [complaint_id]
      ),
      query(
        `SELECT disposition_level, when_expr, confidence_hint, priority
         FROM kb_disposition_rules WHERE complaint_id = $1 AND active = true
         ORDER BY priority LIMIT 10`,
        [complaint_id]
      ),
      query(
        `SELECT rule_id, rule_name, notes, outputs
         FROM kb_master_rules WHERE complaint_id = $1 AND rule_type = 'workup' AND active = true
         ORDER BY priority LIMIT 12`,
        [complaint_id]
      ),
    ]);

    // Diagnostic criteria + key questions from master rules
    const masterDxRes = await query(
      `SELECT diagnosis_id, diagnostic_criteria, key_questions, icd10
       FROM kb_master_rules
       WHERE complaint_id = $1 AND rule_type = 'diagnosis' AND active = true
         AND diagnosis_id IS NOT NULL
       LIMIT 20`,
      [complaint_id]
    );
    const masterDxMap = new Map(masterDxRes.rows.map((r: any) => [r.diagnosis_id, r]));

    const differentials = dxRes.rows.map((dx: any, i: number) => {
      const m: any = masterDxMap.get(dx.diagnosis_id);
      let criteria: string[] = [];
      if (m?.diagnostic_criteria) {
        criteria = (m.diagnostic_criteria as string)
          .split("\n")
          .map((s: string) => s.replace(/^\d+\.\s*/, "").trim())
          .filter(Boolean)
          .slice(0, 5);
      }
      if (criteria.length === 0) {
        criteria = [
          `Presentation consistent with ${dx.diagnosis_label}`,
          dx.cannot_miss
            ? "Cannot-miss — must be actively excluded"
            : "Consider in differential based on history",
        ];
      }
      let keyQuestions: string[] = [];
      if (m?.key_questions) {
        try {
          const parsed =
            typeof m.key_questions === "string"
              ? JSON.parse(m.key_questions)
              : m.key_questions;
          if (Array.isArray(parsed)) keyQuestions = parsed.slice(0, 4);
        } catch {}
      }
      return {
        id: dx.diagnosis_id || `dx_${i}`,
        label: dx.diagnosis_label,
        icdCode: dx.icd_code || m?.icd10 || undefined,
        cannotMiss: !!dx.cannot_miss,
        baseProbability: parseFloat(dx.base_probability) || 0,
        criteria,
        keyQuestions,
      };
    });

    const byCategory = (cats: string[]) =>
      qRes.rows
        .filter((q: any) => cats.includes(q.category))
        .map((q: any) => ({
          field: q.question_key,
          label: q.display_text || q.question_key.replace(/_/g, " "),
        }));

    const workup = workupRes.rows.map((w: any) => ({
      id: w.rule_id,
      label: w.rule_name,
      indication: w.notes || "Clinically indicated for this complaint",
      iconId: "flask",
      always: false,
    }));

    const redFlags = rfRes.rows.map((rf: any) => ({
      id: rf.rule_id,
      label: rf.label,
      severity: rf.severity,
      action: rf.action,
      triggerExpr: rf.trigger_expr,
    }));

    res.json({
      complaint_id,
      complaintLabel: prettifyLabel(complaint_id),
      hpiQuestions: byCategory(["hpi"]),
      rosQuestions: byCategory(["ros", "red_flag"]),
      pmhQuestions: byCategory(["pmh"]),
      fhxQuestions: byCategory(["fhx"]),
      medsQuestions: byCategory(["meds", "vitals"]),
      characters: [
        { field: "high_risk", label: "High-Risk Presentation" },
        { field: "atypical", label: "Atypical Presentation" },
        { field: "elderly_patient", label: "Elderly / Frail Patient" },
        { field: "immunocompromised", label: "Immunocompromised" },
      ],
      onsetOptions: ["Sudden", "Gradual (hours)", "Gradual (days)", "Chronic (weeks+)", "Recurrent"],
      hasSeverityScale: true,
      differentials,
      workup,
      redFlags,
      dispositionRules: dispRes.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
