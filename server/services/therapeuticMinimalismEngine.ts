import type {
  CanonicalTreatmentPlan,
  SyndromeCandidate,
  ClinicalFeatureMap,
} from "../../shared/clinicalConsistency";

function confirmedOrStronglySupported(
  syndrome: SyndromeCandidate | null,
  minScore = 8
): boolean {
  return !!syndrome && syndrome.requiredFeaturesMet && syndrome.score >= minScore;
}

export function buildCanonicalTreatmentPlan(
  complaint: string,
  winning: SyndromeCandidate | null,
  features: ClinicalFeatureMap
): CanonicalTreatmentPlan {
  if (!winning) {
    return {
      class: "supportive",
      indication: "No dominant syndrome established",
      whyChosen: ["Default to safe supportive care when phenotype is not specific enough."],
      whyNotBroader: ["Broader treatment is not justified without a dominant syndrome."],
      blockedAlternatives: ["empiric_multi_drug_bundle"],
    };
  }

  switch (winning.syndromeId) {
    case "viral_pharyngitis":
      return {
        class: "supportive",
        indication: "Symptoms fit viral pharyngitis syndrome",
        whyChosen: [
          "Phenotype is more consistent with viral upper respiratory disease than bacterial infection.",
          "Antibiotics do not improve typical viral sore throat outcomes.",
        ],
        whyNotBroader: [
          "Avoid antibiotic use without specific bacterial justification.",
        ],
        blockedAlternatives: [
          "empiric_azithromycin",
          "empiric_amoxicillin",
          "empiric_ceftriaxone",
        ],
      };

    case "gas_centor_compatible":
      if (features["positive_strep_test"] === true || confirmedOrStronglySupported(winning, 10)) {
        return {
          class: "antibiotic",
          medicationKey: "strep_narrow_first_line",
          indication: "Strep-compatible syndrome with confirmatory or very strong support",
          whyChosen: [
            "Use narrow first-line therapy when strep is supported.",
            "Do not widen coverage without evidence of alternative pathology.",
          ],
          whyNotBroader: [
            "No role for multiple overlapping antibiotics.",
            "No role for ceftriaxone in routine uncomplicated strep management.",
          ],
          blockedAlternatives: [
            "ceftriaxone_plus_azithro_plus_doxy",
            "broad_empiric_combo",
          ],
        };
      }

      return {
        class: "supportive",
        indication: "Strep-compatible but not sufficiently confirmed",
        whyChosen: [
          "Phenotype suggests possible strep but support is not strong enough for reflex treatment.",
          "Testing or follow-up should sharpen the decision.",
        ],
        whyNotBroader: [
          "Treating every sore throat as bacterial creates inconsistency and overtreatment.",
        ],
        blockedAlternatives: [
          "empiric_broad_antibiotics",
        ],
      };

    case "asymptomatic_bacteriuria":
      return {
        class: "none",
        indication: "Positive urine result without urinary symptoms",
        whyChosen: [
          "No treatment is the canonical default for asymptomatic bacteriuria in most non-pregnant adults.",
          "Lab positivity alone is not the disease.",
        ],
        whyNotBroader: [
          "Antibiotics would create harm without clear benefit in the usual case.",
        ],
        blockedAlternatives: [
          "empiric_uti_antibiotics",
          "broad_spectrum_just_in_case",
        ],
      };

    case "simple_cystitis":
      return {
        class: "antibiotic",
        medicationKey: "narrow_uti_first_line",
        indication: "Typical uncomplicated cystitis phenotype",
        whyChosen: [
          "Use narrow first-line UTI treatment only for a consistent symptomatic phenotype.",
        ],
        whyNotBroader: [
          "No reason to cover pyelonephritis, STI, vaginitis, and URI simultaneously.",
        ],
        blockedAlternatives: [
          "ceftriaxone_plus_doxy_plus_fluconazole",
        ],
      };

    case "bacterial_vaginosis_symptomatic":
      if (features["no_vaginal_symptoms"] === true) {
        return {
          class: "none",
          indication: "Incidental BV pattern without symptoms",
          whyChosen: [
            "Do not convert incidental findings into automatic treatment.",
          ],
          whyNotBroader: [
            "Finding is not enough by itself to justify medication.",
          ],
          blockedAlternatives: ["automatic_metronidazole"],
        };
      }

      return {
        class: "topical",
        medicationKey: "bv_first_line",
        indication: "Symptomatic bacterial vaginosis syndrome",
        whyChosen: ["Treat only when the syndrome is present and symptomatic."],
        whyNotBroader: ["Do not add unrelated antibiotic or antifungal coverage."],
        blockedAlternatives: ["uti_plus_sti_plus_bv_combo"],
      };

    case "influenza_like_illness":
      return {
        class: "supportive",
        medicationKey: features["high_risk_for_flu_complications"] ? "consider_targeted_antiviral" : undefined,
        indication: "Influenza-like syndrome",
        whyChosen: [
          "Treatment should be syndrome-specific, not a respiratory shotgun bundle.",
        ],
        whyNotBroader: [
          "No automatic azithromycin, doxycycline, ceftriaxone, or Paxlovid without matching syndrome and indication.",
        ],
        blockedAlternatives: [
          "azithro_plus_doxy_plus_oseltamivir_plus_paxlovid",
        ],
      };

    default:
      return {
        class: "supportive",
        indication: "Fallback conservative treatment",
        whyChosen: ["No explicit narrow protocol matched."],
        whyNotBroader: ["Broader treatment is not justified."],
        blockedAlternatives: ["empiric_multi_drug_bundle"],
      };
  }
}
