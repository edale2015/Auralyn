/**
 * AURALYN — Anatomical Diagram Engine
 *
 * Maps a complaint + diagnosis combination to the right patient-facing
 * anatomical diagram. Diagrams are simple, honest about uncertainty,
 * focused on what changes management (red flags), and available in both
 * physician view and patient living encounter.
 */

export interface DiagramRequest {
  complaintId:      string;
  primaryDiagnosis: string;
  certaintyLevel:   "confirmed" | "probable" | "possible" | "uncertain";
  patientAge?:      number;
  patientSex?:      "male" | "female" | "other";
  redFlagsPresent?: string[];
  keyFindings?:     Record<string, any>;
}

export interface DiagramOutput {
  available:        boolean;
  diagramType:      string;
  svgContent:       string;
  patientCaption:   string;
  physicianNote:    string;
  keyMessage:       string;
  uncertaintyNote:  string | null;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const DIAGRAM_REGISTRY: Record<string, (req: DiagramRequest) => DiagramOutput> = {
  conjunctivitis:      generateEyeDiagram,
  eye_redness:         generateEyeDiagram,
  low_back_pain:       generateLowBackDiagram,
  msk_back_pain:       generateLowBackDiagram,
  musculoskeletal:     generateLowBackDiagram,
  uti:                 generateUrinaryDiagram,
  gu_uti_symptoms:     generateUrinaryDiagram,
  pyelonephritis:      generateUrinaryDiagram,
  nephrolithiasis:     generateUrinaryDiagram,
  chest_pain:          generateChestDiagram,
  cardio_palpitations: generateChestDiagram,
  abdominal_pain:      generateAbdominalDiagram,
  pharyngitis:         generateThroatDiagram,
  sore_throat:         generateThroatDiagram,
  pneumonia:           generateLungDiagram,
  cough:               generateLungDiagram,
  pulm_shortness_of_breath: generateLungDiagram,
  asthma:              generateLungDiagram,
};

export function getDiagram(req: DiagramRequest): DiagramOutput {
  const dxKey = req.primaryDiagnosis.toLowerCase().replace(/\s+/g, "_");
  const generator = DIAGRAM_REGISTRY[dxKey] ?? DIAGRAM_REGISTRY[req.complaintId];

  if (!generator) {
    return {
      available:      false,
      diagramType:    "none",
      svgContent:     "",
      patientCaption: "",
      physicianNote:  "No anatomical diagram available for this complaint/diagnosis combination.",
      keyMessage:     "",
      uncertaintyNote: null,
    };
  }

  return generator(req);
}

// ─── Eye ──────────────────────────────────────────────────────────────────────

function generateEyeDiagram(req: DiagramRequest): DiagramOutput {
  const isConj = req.primaryDiagnosis.toLowerCase().includes("conjunctiv");
  return {
    available:   true,
    diagramType: "eye_anatomy",
    svgContent: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="100" cy="60" rx="80" ry="45" fill="#fff" stroke="#94a3b8" stroke-width="2"/>
  <ellipse cx="100" cy="60" rx="80" ry="45" fill="${isConj ? "rgba(239,68,68,0.15)" : "transparent"}" stroke="${isConj ? "#ef4444" : "none"}" stroke-width="1.5" stroke-dasharray="4"/>
  <circle cx="100" cy="60" r="22" fill="#60a5fa" stroke="#3b82f6" stroke-width="1.5"/>
  <circle cx="100" cy="60" r="10" fill="#1e3a5f"/>
  <circle cx="106" cy="55" r="3" fill="white" opacity="0.7"/>
  ${isConj ? '<text x="100" y="105" text-anchor="middle" font-size="9" fill="#ef4444">Conjunctiva irritated (outer layer)</text>' : ''}
  <text x="100" y="15" text-anchor="middle" font-size="9" fill="#64748b">Eye</text>
</svg>`,
    patientCaption: isConj
      ? "The thin clear layer covering the white of your eye (your conjunctiva) is irritated. Your vision and the deeper parts of your eye are not at risk."
      : "This shows the structure of your eye and where the issue appears to be located.",
    physicianNote: "Conjunctiva highlighted. Cornea, iris, sclera shown as unaffected. Self-limiting nature communicated.",
    keyMessage:    "Your vision is not at risk. This is the outer layer of your eye.",
    uncertaintyNote: req.certaintyLevel === "possible"
      ? "We are treating based on your symptoms. If this does not improve in 5 days or your vision changes, please return."
      : null,
  };
}

// ─── Low Back ─────────────────────────────────────────────────────────────────

function generateLowBackDiagram(req: DiagramRequest): DiagramOutput {
  const hasRedFlags = (req.redFlagsPresent?.length ?? 0) > 0;
  return {
    available:   true,
    diagramType: "lumbar_spine",
    svgContent: `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect x="85" y="20" width="30" height="160" rx="5" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1.5"/>
  ${[40,60,80,100,120].map((y, i) => `
    <rect x="75" y="${y}" width="50" height="16" rx="3" fill="${hasRedFlags && i > 2 ? "rgba(239,68,68,0.3)" : "#e2e8f0"}" stroke="${hasRedFlags && i > 2 ? "#ef4444" : "#94a3b8"}" stroke-width="1"/>
    <text x="100" y="${y+11}" text-anchor="middle" font-size="7" fill="#64748b">L${i+1}</text>
  `).join("")}
  <line x1="130" y1="40" x2="160" y2="40" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3"/>
  <text x="162" y="43" font-size="8" fill="#64748b">Spine</text>
  ${hasRedFlags ? '<text x="100" y="190" text-anchor="middle" font-size="8" fill="#ef4444">Red flag area highlighted</text>' : '<text x="100" y="190" text-anchor="middle" font-size="8" fill="#22c55e">No structural emergency</text>'}
</svg>`,
    patientCaption: hasRedFlags
      ? "Your symptoms include features that require further evaluation. The highlighted area shows why we are ordering additional tests."
      : "This shows your lower spine. Even if imaging shows disc changes or arthritis, this rarely changes treatment. Most back pain improves with time and staying gently active.",
    physicianNote: hasRedFlags
      ? `Red flags present: ${req.redFlagsPresent?.join(", ")}. Diagram highlights relevant anatomy.`
      : "No red flags. Diagram communicates self-limiting nature.",
    keyMessage: hasRedFlags
      ? "Some features of your pain need more evaluation."
      : "Staying active and managing pain is almost always the right approach.",
    uncertaintyNote: !hasRedFlags
      ? "We cannot pinpoint the exact structure causing pain — this rarely matters. The treatment is the same."
      : null,
  };
}

// ─── Urinary ──────────────────────────────────────────────────────────────────

function generateUrinaryDiagram(req: DiagramRequest): DiagramOutput {
  const isPyelo = req.primaryDiagnosis.toLowerCase().includes("pyelo");
  const isStone = req.primaryDiagnosis.toLowerCase().includes("stone") || req.primaryDiagnosis.toLowerCase().includes("nephroli");
  const location = isPyelo ? "kidney" : isStone ? "ureter" : "bladder";

  const certaintyText = {
    confirmed: "Your test results confirm",
    probable:  "Your symptoms strongly suggest",
    possible:  "We suspect",
    uncertain: "We are evaluating whether",
  }[req.certaintyLevel];

  return {
    available:   true,
    diagramType: "urinary_system",
    svgContent: `<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="70"  cy="60" rx="25" ry="35" fill="${location === "kidney" ? "rgba(239,68,68,0.3)" : "#e2e8f0"}" stroke="${location === "kidney" ? "#ef4444" : "#94a3b8"}" stroke-width="1.5"/>
  <ellipse cx="130" cy="60" rx="25" ry="35" fill="${location === "kidney" ? "rgba(239,68,68,0.3)" : "#e2e8f0"}" stroke="${location === "kidney" ? "#ef4444" : "#94a3b8"}" stroke-width="1.5"/>
  <text x="70"  y="65" text-anchor="middle" font-size="8" fill="#64748b">Kidney</text>
  <text x="130" y="65" text-anchor="middle" font-size="8" fill="#64748b">Kidney</text>
  <line x1="70"  y1="95"  x2="90"  y2="145" stroke="${location === "ureter" ? "#ef4444" : "#94a3b8"}" stroke-width="${location === "ureter" ? 3 : 1.5}"/>
  <line x1="130" y1="95"  x2="110" y2="145" stroke="${location === "ureter" ? "#ef4444" : "#94a3b8"}" stroke-width="${location === "ureter" ? 3 : 1.5}"/>
  <text x="57" y="125" font-size="7" fill="${location === "ureter" ? "#ef4444" : "#64748b"}">Ureter</text>
  <ellipse cx="100" cy="165" rx="30" ry="25" fill="${location === "bladder" ? "rgba(239,68,68,0.3)" : "#e2e8f0"}" stroke="${location === "bladder" ? "#ef4444" : "#94a3b8"}" stroke-width="1.5"/>
  <text x="100" y="169" text-anchor="middle" font-size="8" fill="#64748b">Bladder</text>
  <text x="100" y="210" text-anchor="middle" font-size="8" fill="#ef4444">Affected: ${location}</text>
</svg>`,
    patientCaption: `${certaintyText} an infection in your ${location}. The red area shows where the problem is and what your tests suggest.`,
    physicianNote:  `Urinary system with ${location} highlighted. Certainty: ${req.certaintyLevel}.`,
    keyMessage: location === "kidney"
      ? "Kidney infections need prompt treatment — finish the full antibiotic course."
      : location === "ureter"
      ? "Kidney stones are very painful. Most pass on their own with fluids and pain management."
      : "Bladder infections are very common and respond well to antibiotics.",
    uncertaintyNote: req.certaintyLevel === "possible" || req.certaintyLevel === "uncertain"
      ? "We are treating based on your symptoms. Culture results in 2–3 days will confirm the best antibiotic."
      : null,
  };
}

// ─── Chest ────────────────────────────────────────────────────────────────────

function generateChestDiagram(req: DiagramRequest): DiagramOutput {
  return {
    available:   true,
    diagramType: "chest_cardiac",
    svgContent: `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect x="30" y="30" width="140" height="140" rx="12" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>
  <ellipse cx="75"  cy="110" rx="35" ry="50" fill="#dbeafe" stroke="#93c5fd" stroke-width="1.5" opacity="0.7"/>
  <ellipse cx="125" cy="110" rx="35" ry="50" fill="#dbeafe" stroke="#93c5fd" stroke-width="1.5" opacity="0.7"/>
  <text x="75"  y="115" text-anchor="middle" font-size="8" fill="#3b82f6">Lung</text>
  <text x="125" y="115" text-anchor="middle" font-size="8" fill="#3b82f6">Lung</text>
  <path d="M 90 80 Q 100 60 110 80 L 115 130 Q 100 145 85 130 Z" fill="rgba(239,68,68,0.25)" stroke="#ef4444" stroke-width="1.5"/>
  <text x="100" y="108" text-anchor="middle" font-size="7" fill="#ef4444">Heart</text>
  <text x="100" y="185" text-anchor="middle" font-size="8" fill="#64748b">Chest anatomy</text>
</svg>`,
    patientCaption: "This shows your heart, lungs, and chest. The highlighted area shows where your pain appears to be coming from based on your description and tests.",
    physicianNote:  "Chest diagram with cardiac region highlighted. Uncertainty communicated to patient.",
    keyMessage:     req.certaintyLevel === "confirmed"
      ? "Your tests have helped us identify the cause of your chest pain."
      : "Your EKG and initial tests have given us important information. Further evaluation is recommended.",
    uncertaintyNote: req.certaintyLevel !== "confirmed"
      ? "Chest pain has many possible causes. We have ruled out the most dangerous ones at this visit. Follow up as directed."
      : null,
  };
}

// ─── Abdominal ────────────────────────────────────────────────────────────────

function generateAbdominalDiagram(req: DiagramRequest): DiagramOutput {
  const quadrant = (req.keyFindings?.painLocation as string) ?? "diffuse";
  const quadColors = {
    RUQ: { rx: 105, ry: 40, rw: 60, rh: 60, label: "RUQ" },
    LUQ: { rx: 35,  ry: 40, rw: 60, rh: 60, label: "LUQ" },
    RLQ: { rx: 105, ry: 100, rw: 60, rh: 60, label: "RLQ" },
    LLQ: { rx: 35,  ry: 100, rw: 60, rh: 60, label: "LLQ" },
  }[quadrant.toUpperCase()];

  return {
    available:   true,
    diagramType: "abdominal_organs",
    svgContent: `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="100" cy="105" rx="70" ry="75" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>
  <line x1="100" y1="30" x2="100" y2="180" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3"/>
  <line x1="30"  y1="100" x2="170" y2="100" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3"/>
  ${quadColors ? `<rect x="${quadColors.rx}" y="${quadColors.ry}" width="${quadColors.rw}" height="${quadColors.rh}" rx="4" fill="rgba(239,68,68,0.2)" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="3"/>
  <text x="${quadColors.rx + quadColors.rw / 2}" y="${quadColors.ry + quadColors.rh / 2 + 4}" text-anchor="middle" font-size="8" fill="#ef4444">${quadColors.label}</text>` : ""}
  <text x="100" y="190" text-anchor="middle" font-size="8" fill="#64748b">Abdomen — pain location highlighted</text>
</svg>`,
    patientCaption: "This shows the organs in your abdomen. The highlighted area shows where your pain is located and what structures are being evaluated.",
    physicianNote:  `Abdominal diagram with ${quadrant} highlighted. Top differential structures annotated.`,
    keyMessage:     "The location of your pain helps narrow down the cause. Testing will help confirm.",
    uncertaintyNote: "Abdominal pain has many possible causes. The tests ordered will help identify which organ is involved.",
  };
}

// ─── Throat ───────────────────────────────────────────────────────────────────

function generateThroatDiagram(req: DiagramRequest): DiagramOutput {
  const isStrep = req.primaryDiagnosis.toLowerCase().includes("strep");
  return {
    available:   true,
    diagramType: "throat_anatomy",
    svgContent: `<svg viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="100" cy="90" rx="60" ry="70" fill="#fef2f2" stroke="#94a3b8" stroke-width="1.5"/>
  <ellipse cx="72"  cy="75" rx="18" ry="22" fill="${isStrep ? "rgba(239,68,68,0.4)" : "#fecaca"}" stroke="${isStrep ? "#ef4444" : "#fca5a5"}" stroke-width="1.5"/>
  <ellipse cx="128" cy="75" rx="18" ry="22" fill="${isStrep ? "rgba(239,68,68,0.4)" : "#fecaca"}" stroke="${isStrep ? "#ef4444" : "#fca5a5"}" stroke-width="1.5"/>
  <text x="72"  y="78" text-anchor="middle" font-size="7" fill="#7f1d1d">Tonsil</text>
  <text x="128" y="78" text-anchor="middle" font-size="7" fill="#7f1d1d">Tonsil</text>
  <path d="M 80 110 Q 100 125 120 110" fill="none" stroke="${isStrep ? "#ef4444" : "#94a3b8"}" stroke-width="1.5"/>
  <text x="100" y="165" text-anchor="middle" font-size="8" fill="${isStrep ? "#ef4444" : "#64748b"}">${isStrep ? "Strep infection area" : "Throat — viral irritation"}</text>
</svg>`,
    patientCaption: isStrep
      ? "This shows your throat and tonsils. The red area shows where the strep infection is. Antibiotics treat this directly."
      : "This shows your throat. The redness is typically caused by a virus — antibiotics won't help.",
    physicianNote:  "Throat diagram with tonsils and posterior pharynx.",
    keyMessage:     isStrep
      ? "Strep throat responds well to antibiotics. Finish the full course even if you feel better."
      : "This is most likely a viral infection. It will get better on its own.",
    uncertaintyNote: !isStrep
      ? "If your strep culture comes back positive, we will contact you to start antibiotics."
      : null,
  };
}

// ─── Lung ─────────────────────────────────────────────────────────────────────

function generateLungDiagram(req: DiagramRequest): DiagramOutput {
  const isPneumonia = req.primaryDiagnosis.toLowerCase().includes("pneumonia");
  return {
    available:   true,
    diagramType: "lung_anatomy",
    svgContent: `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="70"  cy="110" rx="45" ry="70" fill="${isPneumonia ? "rgba(239,68,68,0.2)" : "#dbeafe"}" stroke="${isPneumonia ? "#ef4444" : "#93c5fd"}" stroke-width="1.5"/>
  <ellipse cx="130" cy="110" rx="45" ry="70" fill="#dbeafe" stroke="#93c5fd" stroke-width="1.5"/>
  <text x="70"  y="115" text-anchor="middle" font-size="8" fill="${isPneumonia ? "#ef4444" : "#3b82f6"}">${isPneumonia ? "Infection" : "Lung"}</text>
  <text x="130" y="115" text-anchor="middle" font-size="8" fill="#3b82f6">Lung</text>
  <line x1="100" y1="40" x2="100" y2="75" stroke="#94a3b8" stroke-width="2"/>
  <text x="100" y="38" text-anchor="middle" font-size="8" fill="#64748b">Airway</text>
  <text x="100" y="185" text-anchor="middle" font-size="8" fill="${isPneumonia ? "#ef4444" : "#64748b"}">${isPneumonia ? "Pneumonia — left lung affected" : "Airways shown"}</text>
</svg>`,
    patientCaption: isPneumonia
      ? "This shows your lungs. The shaded area shows where the infection is. Antibiotics and rest will help clear it."
      : "This shows your airways. When they are narrowed or inflamed, your inhaler opens them back up.",
    physicianNote:  isPneumonia ? "Left lung lobe highlighted — representative of CXR findings." : "Airway diagram showing bronchospasm.",
    keyMessage:     isPneumonia
      ? "Pneumonia is a lung infection that needs antibiotics. Take the full course and rest."
      : "Your airways are irritated. Your inhaler is the most important treatment.",
    uncertaintyNote: isPneumonia && req.certaintyLevel !== "confirmed"
      ? "Your chest X-ray suggests pneumonia. If symptoms don't improve in 48 hours, please call us."
      : null,
  };
}
