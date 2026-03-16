export interface ClinicalCase {
  id: string;
  complaint: string;
  symptoms: string[];
  disposition?: string;
}

export interface CaseCluster {
  clusterId: string;
  symptomSignature: string;
  cases: string[];
  size: number;
  representativeSymptoms: string[];
  suggestedLabel?: string;
}

const DEMO_CASES: ClinicalCase[] = [
  { id: "c001", complaint: "cough", symptoms: ["cough", "fever", "fatigue"], disposition: "self_care" },
  { id: "c002", complaint: "cough", symptoms: ["cough", "fever", "fatigue"], disposition: "self_care" },
  { id: "c003", complaint: "cough", symptoms: ["cough", "fever", "fatigue", "body_aches"], disposition: "urgent" },
  { id: "c004", complaint: "sore_throat", symptoms: ["sore_throat", "fever", "difficulty_swallowing"], disposition: "urgent" },
  { id: "c005", complaint: "sore_throat", symptoms: ["sore_throat", "fever", "difficulty_swallowing"], disposition: "er" },
  { id: "c006", complaint: "headache", symptoms: ["headache", "nausea", "light_sensitivity"], disposition: "self_care" },
  { id: "c007", complaint: "headache", symptoms: ["headache", "nausea", "light_sensitivity"], disposition: "self_care" },
  { id: "c008", complaint: "headache", symptoms: ["headache", "neck_stiffness", "fever"], disposition: "er" },
  { id: "c009", complaint: "ear_pain", symptoms: ["ear_pain", "fever", "hearing_loss"], disposition: "urgent" },
  { id: "c010", complaint: "dizziness", symptoms: ["dizziness", "nausea", "balance_problems"], disposition: "urgent" },
  { id: "c011", complaint: "dizziness", symptoms: ["dizziness", "nausea", "balance_problems"], disposition: "self_care" },
  { id: "c012", complaint: "cough", symptoms: ["cough", "shortness_breath", "chest_pain"], disposition: "er" },
  { id: "c013", complaint: "cough", symptoms: ["cough", "shortness_breath", "chest_pain"], disposition: "er" },
  { id: "c014", complaint: "nasal", symptoms: ["nasal_congestion", "sneezing", "itchy_eyes"], disposition: "self_care" },
  { id: "c015", complaint: "nasal", symptoms: ["nasal_congestion", "sneezing", "itchy_eyes"], disposition: "self_care" },
];

export class CaseClusterDiscoveryEngine {
  cluster(cases?: ClinicalCase[]): CaseCluster[] {
    const caseSet = cases?.length ? cases : DEMO_CASES;
    const clusters: Record<string, { ids: string[]; symptoms: string[] }> = {};

    caseSet.forEach((c) => {
      const key = c.symptoms.slice().sort().join("|");
      if (!clusters[key]) clusters[key] = { ids: [], symptoms: c.symptoms };
      clusters[key].ids.push(c.id);
    });

    return Object.entries(clusters)
      .map(([key, val], i) => ({
        clusterId: `cluster_${i + 1}`,
        symptomSignature: key,
        cases: val.ids,
        size: val.ids.length,
        representativeSymptoms: val.symptoms,
        suggestedLabel: this.suggestLabel(val.symptoms),
      }))
      .sort((a, b) => b.size - a.size);
  }

  private suggestLabel(symptoms: string[]): string {
    if (symptoms.includes("chest_pain") || symptoms.includes("shortness_breath")) return "Cardiopulmonary Alert";
    if (symptoms.includes("neck_stiffness") && symptoms.includes("fever")) return "Meningeal Signs";
    if (symptoms.includes("difficulty_swallowing")) return "Oropharyngeal Obstruction";
    if (symptoms.includes("light_sensitivity")) return "Migraine Pattern";
    if (symptoms.includes("itchy_eyes")) return "Allergic Pattern";
    if (symptoms.includes("balance_problems")) return "Vestibular Syndrome";
    if (symptoms.includes("hearing_loss")) return "Otologic Pattern";
    if (symptoms.includes("body_aches")) return "Systemic Viral Pattern";
    if (symptoms.includes("cough") && symptoms.includes("fever")) return "Upper Respiratory Pattern";
    return "Unclassified Cluster";
  }

  getSummary(cases?: ClinicalCase[]) {
    const clusters = this.cluster(cases);
    return {
      totalCases: (cases?.length ? cases : DEMO_CASES).length,
      totalClusters: clusters.length,
      largestCluster: clusters[0]?.size || 0,
      singletonClusters: clusters.filter((c) => c.size === 1).length,
      clusters,
    };
  }
}

export const caseClusterDiscovery = new CaseClusterDiscoveryEngine();
