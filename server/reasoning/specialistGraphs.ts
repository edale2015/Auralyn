import { ClinicalGraphEngine } from "./clinicalGraphEngine";

export function buildCardiologyGraph(): ClinicalGraphEngine {
  const g = new ClinicalGraphEngine();
  g.addNode({ id: "symptom:chest_pain", type: "symptom", label: "Chest pain" });
  g.addNode({ id: "finding:st_elevation", type: "finding", label: "ST elevation" });
  g.addNode({ id: "diagnosis:acs", type: "diagnosis", label: "Acute coronary syndrome" });
  g.addNode({ id: "test:troponin", type: "test", label: "Troponin" });
  g.addNode({ id: "treatment:acs_bundle", type: "treatment", label: "ACS bundle" });
  g.addNode({ id: "disposition:ed", type: "disposition", label: "Emergency department" });

  g.addEdge({ from: "symptom:chest_pain", to: "diagnosis:acs", condition: (ctx) => ctx.exam?.chestPain, likelihood: 0.5, risk: 0.4 });
  g.addEdge({ from: "diagnosis:acs", to: "finding:st_elevation", condition: (ctx) => ctx.tests?.ecgStElevation, likelihood: 0.4, risk: 0.3 });
  g.addEdge({ from: "diagnosis:acs", to: "test:troponin", likelihood: 0.3, risk: 0.1 });
  g.addEdge({ from: "finding:st_elevation", to: "treatment:acs_bundle", likelihood: 0.8, risk: 0.4 });
  g.addEdge({ from: "treatment:acs_bundle", to: "disposition:ed", likelihood: 0.7, risk: 0.3 });
  return g;
}

export function buildInfectiousDiseaseGraph(): ClinicalGraphEngine {
  const g = new ClinicalGraphEngine();
  g.addNode({ id: "symptom:fever", type: "symptom", label: "Fever" });
  g.addNode({ id: "diagnosis:sepsis", type: "diagnosis", label: "Sepsis" });
  g.addNode({ id: "diagnosis:pneumonia", type: "diagnosis", label: "Pneumonia" });
  g.addNode({ id: "test:cultures", type: "test", label: "Blood cultures" });
  g.addNode({ id: "treatment:antibiotics", type: "treatment", label: "Broad antibiotics" });
  g.addNode({ id: "disposition:admit", type: "disposition", label: "Admit" });

  g.addEdge({ from: "symptom:fever", to: "diagnosis:sepsis", condition: (ctx) => (ctx.vitals?.systolic ?? 120) < 90, likelihood: 0.7, risk: 0.5 });
  g.addEdge({ from: "symptom:fever", to: "diagnosis:pneumonia", condition: (ctx) => ctx.tests?.infiltrateOnCxr, likelihood: 0.6, risk: 0.2 });
  g.addEdge({ from: "diagnosis:sepsis", to: "test:cultures", likelihood: 0.6, risk: 0.1 });
  g.addEdge({ from: "diagnosis:sepsis", to: "treatment:antibiotics", likelihood: 0.9, risk: 0.3 });
  g.addEdge({ from: "treatment:antibiotics", to: "disposition:admit", likelihood: 0.6, risk: 0.2 });
  return g;
}

export function buildICUGraph(): ClinicalGraphEngine {
  const g = new ClinicalGraphEngine();
  g.addNode({ id: "symptom:instability", type: "symptom", label: "Instability" });
  g.addNode({ id: "diagnosis:resp_failure", type: "diagnosis", label: "Respiratory failure" });
  g.addNode({ id: "diagnosis:shock", type: "diagnosis", label: "Shock" });
  g.addNode({ id: "treatment:oxygen", type: "treatment", label: "Oxygen" });
  g.addNode({ id: "treatment:pressors", type: "treatment", label: "Pressors" });
  g.addNode({ id: "disposition:icu", type: "disposition", label: "ICU" });

  g.addEdge({ from: "symptom:instability", to: "diagnosis:resp_failure", condition: (ctx) => (ctx.vitals?.spo2 ?? 100) < 90, likelihood: 0.7, risk: 0.5 });
  g.addEdge({ from: "symptom:instability", to: "diagnosis:shock", condition: (ctx) => (ctx.vitals?.systolic ?? 120) < 90, likelihood: 0.7, risk: 0.5 });
  g.addEdge({ from: "diagnosis:resp_failure", to: "treatment:oxygen", likelihood: 0.8, risk: 0.3 });
  g.addEdge({ from: "diagnosis:shock", to: "treatment:pressors", likelihood: 0.7, risk: 0.3 });
  g.addEdge({ from: "treatment:oxygen", to: "disposition:icu", likelihood: 0.7, risk: 0.3 });
  g.addEdge({ from: "treatment:pressors", to: "disposition:icu", likelihood: 0.9, risk: 0.4 });
  return g;
}

export function buildMasterGraph(): ClinicalGraphEngine {
  const g = new ClinicalGraphEngine();
  g.addNode({ id: "master:start", type: "finding", label: "Case start" });
  g.addNode({ id: "master:ed", type: "disposition", label: "Emergency evaluation" });
  g.addNode({ id: "master:admit", type: "disposition", label: "Hospital admission" });
  g.addNode({ id: "master:icu", type: "disposition", label: "ICU" });

  g.addEdge({ from: "master:start", to: "master:ed", condition: (ctx) => ctx.masterRisk >= 0.65, likelihood: 0.8, risk: 0.4 });
  g.addEdge({ from: "master:start", to: "master:admit", condition: (ctx) => ctx.masterRisk >= 0.45, likelihood: 0.5, risk: 0.2 });
  g.addEdge({ from: "master:start", to: "master:icu", condition: (ctx) => ctx.masterRisk >= 0.85, likelihood: 0.9, risk: 0.5 });
  return g;
}
