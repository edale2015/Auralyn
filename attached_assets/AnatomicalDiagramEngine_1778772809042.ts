/**
 * AURALYN — Anatomical Diagram Engine
 *
 * Maps a complaint + diagnosis combination to the right patient-facing
 * anatomical diagram. Diagrams are:
 *   - Simple enough for any patient to understand
 *   - Honest about diagnostic uncertainty
 *   - Focused on what actually changes management (red flags)
 *   - Available in physician view AND patient living encounter
 *
 * Design philosophy:
 *   Show where the problem is. Show what matters. Show what doesn't matter.
 *   Show what we know vs what we're uncertain about.
 *   Never use jargon without explanation.
 *
 * File: server/diagrams/AnatomicalDiagramEngine.ts
 */

export interface DiagramRequest {
  complaintId: string;
  primaryDiagnosis: string;
  certaintyLevel: "confirmed" | "probable" | "possible" | "uncertain";
  patientAge?: number;
  patientSex?: "male" | "female" | "other";
  redFlagsPresent?: string[];
  keyFindings?: Record<string, any>;
}

export interface DiagramOutput {
  available: boolean;
  diagramType: string;
  svgContent: string;          // inline SVG for rendering
  patientCaption: string;      // plain English caption for patient
  physicianNote: string;       // what the diagram communicates to physician
  keyMessage: string;          // the one thing the patient should take away
  uncertaintyNote: string | null; // honest statement about what we don't know
}

// Diagram registry — maps complaint/diagnosis to generator function
const DIAGRAM_REGISTRY: Record<string, (req: DiagramRequest) => DiagramOutput> = {
  "conjunctivitis":     generateEyeDiagram,
  "eye_redness":        generateEyeDiagram,
  "low_back_pain":      generateLowBackDiagram,
  "musculoskeletal":    generateLowBackDiagram,
  "uti":                generateUrinaryDiagram,
  "gu_uti_symptoms":    generateUrinaryDiagram,
  "pyelonephritis":     generateUrinaryDiagram,
  "nephrolithiasis":    generateUrinaryDiagram,
  "chest_pain":         generateChestDiagram,
  "abdominal_pain":     generateAbdominalDiagram,
  "pharyngitis":        generateThroatDiagram,
  "sore_throat":        generateThroatDiagram,
  "pneumonia":          generateLungDiagram,
  "asthma":             generateLungDiagram,
};

export function getDiagram(req: DiagramRequest): DiagramOutput {
  // Try primary diagnosis first, then complaint ID
  const generator =
    DIAGRAM_REGISTRY[req.primaryDiagnosis.toLowerCase().replace(/ /g, "_")] ||
    DIAGRAM_REGISTRY[req.complaintId];

  if (!generator) {
    return {
      available: false,
      diagramType: "none",
      svgContent: "",
      patientCaption: "",
      physicianNote: "No anatomical diagram available for this complaint/diagnosis combination.",
      keyMessage: "",
      uncertaintyNote: null,
    };
  }

  return generator(req);
}

// ─── EYE DIAGRAM ──────────────────────────────────────────────────────────
function generateEyeDiagram(req: DiagramRequest): DiagramOutput {
  const isConjunctivitis = req.primaryDiagnosis.toLowerCase().includes("conjunctiv");

  return {
    available: true,
    diagramType: "eye_anatomy",
    svgContent: `<!-- Eye SVG rendered by client component EyeDiagram -->`,
    patientCaption: isConjunctivitis
      ? "The red area shows your conjunctiva — the thin clear layer covering the white of your eye. This is what is irritated. Your vision and the deeper parts of your eye are not at risk."
      : "This shows the structure of your eye and where the issue appears to be located.",
    physicianNote: "Conjunctiva highlighted in red. Cornea, iris, and sclera shown as unaffected. Self-limiting nature and treatment shown.",
    keyMessage: "Your vision is not at risk. This is the outer layer of your eye.",
    uncertaintyNote: req.certaintyLevel === "possible"
      ? "We are treating based on your symptoms. If this does not improve in 5 days or your vision changes, you should be re-evaluated."
      : null,
  };
}

// ─── LOW BACK DIAGRAM ─────────────────────────────────────────────────────
function generateLowBackDiagram(req: DiagramRequest): DiagramOutput {
  const hasRedFlags = (req.redFlagsPresent?.length ?? 0) > 0;

  return {
    available: true,
    diagramType: "lumbar_spine",
    svgContent: `<!-- Low back SVG rendered by client component LumbarDiagram -->`,
    patientCaption: hasRedFlags
      ? "Your symptoms include features that require further evaluation. The red flags shown here are why we are ordering additional tests or referral."
      : "This shows your lumbar spine. Even if imaging shows disc changes or arthritis, this rarely changes what helps. Most back pain gets better with time and staying active.",
    physicianNote: hasRedFlags
      ? `Red flags present: ${req.redFlagsPresent?.join(", ")}. Diagram highlights relevant anatomy for escalation.`
      : "No red flags. Diagram communicates self-limiting nature and irrelevance of routine imaging.",
    keyMessage: hasRedFlags
      ? "Some features of your pain need more evaluation."
      : "Staying active and treating pain is almost always the right approach — imaging rarely changes this.",
    uncertaintyNote: !hasRedFlags
      ? "We cannot tell exactly what structure is causing your pain, and this rarely matters. The treatment is the same."
      : null,
  };
}

// ─── URINARY DIAGRAM ──────────────────────────────────────────────────────
function generateUrinaryDiagram(req: DiagramRequest): DiagramOutput {
  const location = req.primaryDiagnosis.toLowerCase().includes("pyelo") ? "kidney"
    : req.primaryDiagnosis.toLowerCase().includes("stone") ? "ureter"
    : "bladder";

  const certaintyText = {
    confirmed: "Your test results confirm",
    probable: "Your symptoms strongly suggest",
    possible: "We suspect",
    uncertain: "We are evaluating whether",
  }[req.certaintyLevel];

  return {
    available: true,
    diagramType: "urinary_system",
    svgContent: `<!-- Urinary SVG rendered by client component UrinaryDiagram -->`,
    patientCaption: `${certaintyText} an infection in your ${location}. The diagram shows where the problem is and what your tests suggest.`,
    physicianNote: `Urinary system diagram with ${location} highlighted. Certainty level: ${req.certaintyLevel}. UA findings mapped to diagram legend.`,
    keyMessage: location === "kidney"
      ? "Kidney infections need prompt treatment — your antibiotic prescription is important to finish completely."
      : location === "ureter"
      ? "Kidney stones can be very painful. Most pass on their own with fluids and pain management."
      : "Bladder infections are very common and respond well to antibiotics.",
    uncertaintyNote: req.certaintyLevel === "possible" || req.certaintyLevel === "uncertain"
      ? "We are treating based on your symptoms and tests. Culture results in 2-3 days will confirm the exact bacteria and best antibiotic."
      : null,
  };
}

// ─── CHEST DIAGRAM ────────────────────────────────────────────────────────
function generateChestDiagram(req: DiagramRequest): DiagramOutput {
  return {
    available: true,
    diagramType: "chest_cardiac",
    svgContent: `<!-- Chest SVG rendered by client component ChestDiagram -->`,
    patientCaption: "This shows your heart, lungs, and chest wall. The highlighted area shows where your pain appears to be coming from based on your description and tests.",
    physicianNote: "Chest diagram with relevant structure highlighted based on working diagnosis. Uncertainty communicated to patient.",
    keyMessage: req.certaintyLevel === "confirmed"
      ? "Your tests have helped us identify the cause of your chest pain."
      : "Your EKG and initial tests have given us important information. Further evaluation is recommended.",
    uncertaintyNote: req.certaintyLevel !== "confirmed"
      ? "Chest pain has many possible causes. We have ruled out the most dangerous ones at this visit. You should follow up as directed."
      : null,
  };
}

// ─── ABDOMINAL DIAGRAM ────────────────────────────────────────────────────
function generateAbdominalDiagram(req: DiagramRequest): DiagramOutput {
  return {
    available: true,
    diagramType: "abdominal_organs",
    svgContent: `<!-- Abdominal SVG rendered by client component AbdominalDiagram -->`,
    patientCaption: "This shows the organs in your abdomen. The highlighted area shows where your pain is located and what structures are being evaluated.",
    physicianNote: "Abdominal diagram with quadrant highlighted based on pain location. Top differential structures annotated.",
    keyMessage: "The location of your pain helps narrow down what might be causing it. Testing will help confirm.",
    uncertaintyNote: "Abdominal pain has many possible causes. The tests we have ordered will help identify which organ is involved.",
  };
}

// ─── THROAT DIAGRAM ───────────────────────────────────────────────────────
function generateThroatDiagram(req: DiagramRequest): DiagramOutput {
  const isStrep = req.primaryDiagnosis.toLowerCase().includes("strep");
  return {
    available: true,
    diagramType: "throat_anatomy",
    svgContent: `<!-- Throat SVG rendered by client component ThroatDiagram -->`,
    patientCaption: isStrep
      ? "This shows your throat and tonsils. The red area shows where the strep infection is. Antibiotics will treat this directly."
      : "This shows your throat. The redness and irritation is typically caused by a virus, which antibiotics will not help.",
    physicianNote: "Throat diagram with tonsils and posterior pharynx. Exudate/redness highlighted if strep suspected.",
    keyMessage: isStrep
      ? "Strep throat responds well to antibiotics. Finish the full course even if you feel better."
      : "This is most likely a viral infection. It will get better on its own.",
    uncertaintyNote: !isStrep
      ? "If your strep culture comes back positive, we will contact you to start antibiotics."
      : null,
  };
}

// ─── LUNG DIAGRAM ─────────────────────────────────────────────────────────
function generateLungDiagram(req: DiagramRequest): DiagramOutput {
  const isPneumonia = req.primaryDiagnosis.toLowerCase().includes("pneumonia");
  return {
    available: true,
    diagramType: "lung_anatomy",
    svgContent: `<!-- Lung SVG rendered by client component LungDiagram -->`,
    patientCaption: isPneumonia
      ? "This shows your lungs. The shaded area shows where the infection is. Antibiotics and rest will help your lungs clear this."
      : "This shows your airways. In asthma, the airways become narrow and inflamed. Your inhalers help open them back up.",
    physicianNote: isPneumonia
      ? "Lung diagram with affected lobe highlighted based on CXR findings."
      : "Airway diagram showing bronchospasm and bronchodilator effect.",
    keyMessage: isPneumonia
      ? "Pneumonia is a lung infection that needs antibiotics. Take the full course and rest."
      : "Your airways are irritated and narrowed. Your inhalers are the most important treatment.",
    uncertaintyNote: isPneumonia && req.certaintyLevel !== "confirmed"
      ? "Your chest X-ray suggests pneumonia. If symptoms do not improve in 48 hours on antibiotics, call us."
      : null,
  };
}

/**
 * INTEGRATION NOTE:
 *
 * This engine runs after the clinical reasoning engine produces a disposition.
 * It is called in two places:
 *
 * 1. Patient living encounter page (/care/:token):
 *    After disposition is shown, render the appropriate diagram below it.
 *    The diagram explains WHY the disposition was recommended.
 *
 * 2. Physician encounter page:
 *    Optional "Show patient diagram" button that opens a preview
 *    of what the patient will see, so the physician can verify it
 *    accurately represents the diagnosis before sending.
 *
 * The SVG content is rendered by React components in:
 *   client/src/components/diagrams/EyeDiagram.tsx
 *   client/src/components/diagrams/LumbarDiagram.tsx
 *   client/src/components/diagrams/UrinaryDiagram.tsx
 *   client/src/components/diagrams/ChestDiagram.tsx
 *   client/src/components/diagrams/AbdominalDiagram.tsx
 *   client/src/components/diagrams/ThroatDiagram.tsx
 *   client/src/components/diagrams/LungDiagram.tsx
 *
 * Each React component takes:
 *   - highlightedStructure: string (which part to color red/amber)
 *   - certaintyLevel: "confirmed" | "probable" | "possible" | "uncertain"
 *   - redFlagsPresent: string[]
 *   - showTreatment: boolean
 *
 * The diagrams shown in the conversation above ARE the patient-facing versions.
 * They can be directly embedded in the PatientLivingEncounter page.
 */
