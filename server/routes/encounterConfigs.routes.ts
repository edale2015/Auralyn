import { Router } from "express";
import { db, query } from "../db";
import { sql } from "drizzle-orm";
import { requireRole } from "../middleware/requireRole";
import { requireReviewAuth } from "../middleware/reviewAuth";

const router = Router();
const auth = [requireReviewAuth, requireRole(["admin", "physician"])];

function prettifyLabel(id: string): string {
  const prefixMap: [string, string][] = [
    ["gi_", "GI: "], ["cardio_", "Cardio: "], ["card_", "Cardio: "],
    ["ent_", "ENT: "], ["gu_", "GU: "], ["endo_", "Endo: "],
    ["derm_", "Derm: "], ["id_", "ID: "], ["neuro_", "Neuro: "],
    ["msk_", "MSK: "], ["pulm_", "Pulm: "], ["environmental_", "Env: "],
    ["tox_", "Tox: "], ["general_", "General: "],
  ];
  for (const [prefix, display] of prefixMap) {
    if (id.startsWith(prefix)) {
      const rest = id.slice(prefix.length).replace(/_/g, " ");
      return display + rest.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getSystem(id: string): string {
  if (/^gi_|abdominal|constipation|diarrhea|vomiting|dysphagia|jaundice|epigastric|hernia/.test(id)) return "GI";
  if (/^cardio_|^card_|chest_pain|palpitation|syncope|vascular|hypertension/.test(id)) return "Cardiovascular";
  if (/^ent_|sore_throat|ear_pain|nasal|epistaxis|hoarseness|stridor|cheilitis/.test(id)) return "ENT";
  if (/^gu_|testicular|vaginal|urinary|uti_|hematuria|flank_pain|genital/.test(id)) return "GU/Urology";
  if (/^endo_|diabetes|hyperglycemia|hypoglycemia|thyroid|adrenal|weight_manag|eating_disorder/.test(id)) return "Endocrine";
  if (/^derm_|rash|skin_|cellulitis|acne|hair_|aphthous|burn|blistering/.test(id)) return "Dermatology";
  if (/^id_|fever|bite|sting|arthropod|tick|snake|spider|insect|infestation|febrile_neutro/.test(id)) return "Infectious Disease";
  if (/headache|dizziness|vertigo|seizure|focal_deficit|confusion|neuro_|cord_|bell_|head_trauma|weakness_neuro/.test(id)) return "Neurology";
  if (/back_pain|joint_pain|shoulder_pain|elbow_pain|ankle|foot_pain|hip_pain|wrist|arm_forearm|msk_|knee|dental_pain|breast_pain/.test(id)) return "MSK/Ortho";
  if (/cough|shortness_of_breath|wheez|hemoptysis|pulm_|atypical_pneumonia/.test(id)) return "Pulmonology";
  if (/^environmental_|cold_exposure|heat_|altitude|avalanche|uv_exposure|thermal_burn|electrical|blast/.test(id)) return "Environmental";
  if (/^tox_|alcohol_withdrawal|withdrawal|substance_use|drug_reaction|toxin|chemical|poison/.test(id)) return "Toxicology";
  if (/anxiety|depression|insomnia/.test(id)) return "Psychiatry";
  if (/^general_|^fatigue$|asymptomatic|weight_loss/.test(id)) return "General";
  return "Other";
}

// GET /api/encounter-configs — full complaint list from KB
router.get("/", ...auth, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        d.complaint_id,
        COUNT(DISTINCT d.id) AS dx_count,
        COUNT(DISTINCT r.id) AS rf_count
      FROM kb_diagnosis_rules d
      LEFT JOIN kb_red_flag_rules r ON r.complaint_id = d.complaint_id
      WHERE d.active = true
      GROUP BY d.complaint_id
      HAVING COUNT(DISTINCT d.id) >= 1
      ORDER BY d.complaint_id
    `);
    res.json(
      result.rows.map((row: any) => ({
        id: row.complaint_id,
        label: prettifyLabel(row.complaint_id),
        system: getSystem(row.complaint_id),
        dxCount: parseInt(row.dx_count),
        rfCount: parseInt(row.rf_count),
      }))
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/encounter-configs/:complaint_id — dynamic config assembled from KB tables
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

    // Fetch diagnostic criteria + key questions from master rules
    const masterDxRes = await query(
      `SELECT diagnosis_id, diagnostic_criteria, key_questions, icd10
       FROM kb_master_rules
       WHERE complaint_id = $1 AND rule_type = 'diagnosis' AND active = true
         AND diagnosis_id IS NOT NULL
       LIMIT 20`,
      [complaint_id]
    );
    const masterDxMap = new Map(masterDxRes.rows.map((r: any) => [r.diagnosis_id, r]));

    // Build differentials
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
