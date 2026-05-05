/**
 * clinicalImageIntake.ts
 * Drop into: server/intake/clinicalImageIntake.ts
 *
 * CLINICAL IMAGE INTAKE — WHATSAPP PHOTO TRIAGE
 *
 * THE ARTICLE'S PRACTICAL APPLICATION FOR AURALYN:
 * While JEPA-based clinical imaging models are not production-ready,
 * the article correctly identifies that urgent care has significant
 * value in visual assessment. Patient-uploaded photos close the
 * physical exam gap in telehealth triage for visual complaints.
 *
 * IMMEDIATE USE CASES (no specialized model needed):
 * - Skin infections: cellulitis spread, abscess, necrotizing fasciitis concern
 * - Rashes: distribution, morphology, petechiae/purpura (meningococcemia screen)
 * - Wounds: depth, contamination, signs of infection
 * - Eye complaints: conjunctival injection, discharge character, lid swelling
 * - Ear: external canal, post-auricular area (mastoiditis screen)
 *
 * SAFETY PRINCIPLE:
 * Photo assessment is ADDITIONAL INFORMATION, never a replacement for exam.
 * Every image assessment feeds into KB query + physician review.
 * No disposition is made from image alone.
 *
 * INTEGRATION POINT:
 * Called from the WhatsApp intake handler when:
 * 1. Complaint is in VISUAL_COMPLAINT_SLUGS list
 * 2. Patient sends an MMS (Twilio media URL)
 * 3. Physician requests a follow-up photo
 *
 * FUTURE MIGRATION PATH (Rec 8):
 * When AMI Labs or equivalent releases a production-ready clinical
 * imaging model under permissive license, replace analyzeClinicalImage()
 * with the specialized model inference call. The interface stays the same.
 */

import { llmGateway }    from "../gateway/llmGateway";
import { appendAuditEvent } from "../governance/audit";
import * as https        from "https";

// ─── Complaints where photo adds clinical value ───────────────────────────────

export const VISUAL_COMPLAINT_SLUGS = new Set([
  "skin_infection",
  "rash_mild",
  "wound_laceration",
  "eye_complaint",
  "pink_eye",
  "ear_pain",
  "dental_pain",
  "burn",
  "contact_dermatitis",
  "shingles",
  "urticaria",
  "insect_bite_sting",
  "periorbital_cellulitis",
]);

// ─── Photo request messages ───────────────────────────────────────────────────

export const PHOTO_REQUEST_MESSAGES: Record<string, string> = {
  skin_infection:      "To help assess your skin concern, could you share a clear photo of the affected area? Please make sure the photo shows the borders of the redness and any swelling.",
  rash_mild:           "A photo of your rash would help us evaluate it better. Please capture the full extent of the rash and any areas that look different from surrounding skin.",
  wound_laceration:    "Please send a photo of the wound. Show the full wound and surrounding area — do not clean it before the photo so we can assess it accurately.",
  eye_complaint:       "A photo of your eye would be helpful. Look straight at the camera and try to show both eyes so we can compare them.",
  pink_eye:            "Please send a photo showing both eyes — look straight at the camera in good lighting.",
  ear_pain:            "If you can see any swelling or redness around your ear, please send a photo showing that area and the area just behind your ear.",
  default:             "A photo of the affected area would help us evaluate your condition. Please send a clear photo in good lighting.",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClinicalImageAnalysis {
  complaintSlug:       string;
  analysisText:        string;   // full Claude vision assessment
  urgencySignals:      string[]; // specific concerning findings
  redFlagDetected:     boolean;
  redFlagDescription?: string;
  additionalSymptoms:  string[]; // findings that add to the KB query
  examFindings:        string;   // formatted for physician display
  confidence:          "high" | "moderate" | "low";
  imageQuality:        "adequate" | "poor" | "unusable";
}

// ─── Image fetcher ────────────────────────────────────────────────────────────

async function fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    https.get(imageUrl, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => {
        const buffer   = Buffer.concat(chunks);
        const data     = buffer.toString("base64");
        const mediaType = response.headers["content-type"] ?? "image/jpeg";
        resolve({ data, mediaType });
      });
      response.on("error", reject);
    }).on("error", reject);
  });
}

// ─── Clinical image analyzer ──────────────────────────────────────────────────

export async function analyzeClinicalImage(
  imageUrl:      string,
  complaintSlug: string,
  caseId:        string,
  patientContext?: string  // brief context from intake answers
): Promise<ClinicalImageAnalysis> {

  // Fetch the image
  let imageBase64: string;
  let mediaType:   string;

  try {
    const fetched = await fetchImageAsBase64(imageUrl);
    imageBase64   = fetched.data;
    mediaType     = fetched.mediaType;
  } catch (err: any) {
    throw new Error(`Failed to fetch clinical image: ${err.message}`);
  }

  // Clinical assessment prompt — complaint-specific
  const clinicalPrompt = buildClinicalImagePrompt(complaintSlug, patientContext);

  // Call via gateway with image content block
  // Note: this uses a direct Anthropic call because llmGateway doesn't
  // yet support image content blocks. Add to Win 17 gateway enhancement list.
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client    = new Anthropic();

  const response = await client.messages.create({
    model:      "claude-opus-4-20250514",  // Vision capability
    max_tokens: 800,
    system: `You are a clinical image assessment assistant for an urgent care physician.
Your role: describe what you observe in the image with clinical precision.
You are providing ADDITIONAL INFORMATION to a physician — not making a diagnosis.
Always note image quality limitations. Always recommend physician examination.
Flag any findings that suggest immediate emergency evaluation.`,
    messages: [{
      role:    "user",
      content: [
        {
          type:   "image",
          source: {
            type:       "base64",
            media_type: mediaType as "image/jpeg" | "image/png" | "image/webp",
            data:       imageBase64,
          },
        },
        { type: "text", text: clinicalPrompt },
      ],
    }],
  });

  const analysisText = response.content
    .filter(b => b.type === "text")
    .map(b => (b as any).text)
    .join("").trim();

  // Parse the structured response
  const parsed = parseImageAnalysis(analysisText, complaintSlug);

  // Audit event — log that image was analyzed (no PHI in details)
  await appendAuditEvent({
    actor:      "system",
    action:     "CLINICAL_IMAGE_ANALYZED",
    entityId:   caseId,
    entityType: "case",
    details: {
      complaintSlug,
      redFlagDetected: parsed.redFlagDetected,
      urgencySignalCount: parsed.urgencySignals.length,
      imageQuality: parsed.imageQuality,
      confidence: parsed.confidence,
      // No image URL logged — PHI risk (image may contain patient face/identity)
    },
  }).catch(console.error);

  return parsed;
}

// ─── Complaint-specific prompts ───────────────────────────────────────────────

function buildClinicalImagePrompt(complaintSlug: string, patientContext?: string): string {
  const context = patientContext ? `\nPatient context: ${patientContext}` : "";

  const prompts: Record<string, string> = {
    skin_infection: `${context}

Assess this image for skin/soft tissue infection. Describe:
1. SIZE: Approximate dimensions of erythema, induration, or fluctuance
2. BORDERS: Well-demarcated vs spreading; any streaking (lymphangitis)
3. SKIN: Color, temperature appearance, texture, skin breakdown
4. FLUCTUANCE: Any evidence of abscess/collection
5. SURROUNDING TISSUE: Edema, bullae, skin discoloration (purple/gray = concerning)
6. CREPITUS VISIBLE: Any gas or irregular texture suggesting deep infection

RED FLAG - IMMEDIATE ER:
- Purple or gray discoloration of skin
- Visible gas in tissue
- Rapid spread (mark borders mentally and assess)
- Appears to cross fascial planes
- Any vesicles over indurated area

Provide a brief clinical description suitable for a physician note.`,

    rash_mild: `${context}

Assess this rash image. Describe:
1. MORPHOLOGY: Macules, papules, vesicles, pustules, urticaria, petechiae, purpura
2. DISTRIBUTION: Localized vs widespread, dermatome pattern, sun-exposed areas
3. COLOR: Erythematous, violaceous, brown, hypopigmented
4. BORDERS: Sharp vs diffuse
5. SECONDARY CHANGES: Scaling, crusting, excoriation, lichenification

RED FLAG - IMMEDIATE ER:
- Petechiae or purpura (non-blanching spots) — meningococcemia
- Rapidly spreading urticaria with any facial swelling — anaphylaxis
- Bullae (blisters) with skin separation — Stevens-Johnson
- Vesicles in dermatomal pattern with severe pain — herpes zoster

Provide morphological description for physician differential.`,

    wound_laceration: `${context}

Assess this wound image. Describe:
1. MECHANISM APPEARANCE: Clean vs jagged vs stellate; puncture vs laceration
2. DEPTH: Surface vs deep; any visible subcutaneous fat, fascia, tendon, bone
3. CONTAMINATION: Clean vs contaminated vs grossly contaminated
4. EDGES: Can be approximated vs tissue loss
5. SURROUNDING: Erythema, edema, cellulitis suggesting infection
6. LOCATION: Body region, proximity to joints, tendons, vessels

RED FLAG:
- Visible tendon or bone
- Pulsatile bleeding visible
- Wound over joint line
- Devitalized tissue

Provide wound description for repair decision and infection assessment.`,

    eye_complaint: `${context}

Assess this eye image. Describe:
1. CONJUNCTIVA: Injection pattern (limbal vs diffuse), chemosis
2. DISCHARGE: Purulent, mucopurulent, watery, amount
3. LIDS: Edema, erythema, ptosis, position
4. CORNEA: Clarity, any visible opacity or defect
5. PUPIL: Size and reactivity if visible
6. SYMMETRY: Compare both eyes

RED FLAG - IMMEDIATE ER:
- Proptosis (eye pushed forward)
- Fixed dilated pupil
- Corneal opacity or white spot
- Hypopyon (pus layer in lower anterior chamber)
- Restricted eye movement

Provide ocular assessment for physician.`,
  };

  return prompts[complaintSlug] ?? `${context}

Assess this clinical image for the complaint: ${complaintSlug.replace(/_/g, " ")}.
Describe relevant findings with clinical precision. Note any urgent or concerning features.
Provide image quality assessment. Flag anything requiring immediate evaluation.`;
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseImageAnalysis(
  analysisText: string,
  complaintSlug: string
): ClinicalImageAnalysis {

  const lower = analysisText.toLowerCase();

  // Detect red flags
  const redFlagTerms = [
    "immediate er", "emergency evaluation", "immediate emergency",
    "purpura", "petechiae", "non-blanching",
    "proptosis", "hypopyon", "corneal ulcer",
    "purple discoloration", "gray discoloration", "gas in tissue",
    "pulsatile bleeding", "exposed tendon", "exposed bone",
    "rapidly spreading", "necrotizing",
    "bilateral lid swelling", "fixed dilated pupil",
  ];

  const redFlagDetected = redFlagTerms.some(term => lower.includes(term));

  const redFlagDescription = redFlagDetected
    ? extractSentenceContaining(analysisText, redFlagTerms)
    : undefined;

  // Extract urgency signals
  const urgencySignals: string[] = [];
  const urgencyTerms = [
    "concerning", "worrisome", "urgent", "requires prompt",
    "lymphangitis", "streaking", "fluctuant", "abscess",
    "spreading", "bullae", "vesicles", "pustules",
    "purulent discharge", "chemosis", "proptosis",
  ];
  urgencyTerms.forEach(term => {
    if (lower.includes(term)) {
      const sentence = extractSentenceContaining(analysisText, [term]);
      if (sentence) urgencySignals.push(sentence);
    }
  });

  // Extract additional symptoms for KB query
  const additionalSymptoms: string[] = [];
  if (lower.includes("lymphangitis") || lower.includes("streaking")) additionalSymptoms.push("lymphangitis");
  if (lower.includes("fluctuant") || lower.includes("abscess"))       additionalSymptoms.push("abscess_present");
  if (lower.includes("purulent"))                                       additionalSymptoms.push("purulent_discharge");
  if (lower.includes("petechiae") || lower.includes("purpura"))        additionalSymptoms.push("petechiae_purpura");
  if (lower.includes("bullae") || lower.includes("blistering"))        additionalSymptoms.push("bullae_present");

  // Image quality
  const imageQuality: "adequate" | "poor" | "unusable" =
    lower.includes("cannot assess") || lower.includes("image quality") ? "poor" :
    lower.includes("unable to") || lower.includes("too blurry") ? "unusable" : "adequate";

  // Confidence
  const confidence: "high" | "moderate" | "low" =
    imageQuality === "unusable" ? "low" :
    imageQuality === "poor"     ? "moderate" : "high";

  // Format for physician display
  const examFindings = `[Photo Assessment] ${analysisText.slice(0, 400)}${analysisText.length > 400 ? "..." : ""}`;

  return {
    complaintSlug,
    analysisText,
    urgencySignals: [...new Set(urgencySignals)].slice(0, 5),
    redFlagDetected,
    redFlagDescription,
    additionalSymptoms,
    examFindings,
    confidence,
    imageQuality,
  };
}

function extractSentenceContaining(text: string, terms: string[]): string {
  const sentences = text.match(/[^.!?]*[.!?]/g) ?? [];
  for (const sentence of sentences) {
    const sl = sentence.toLowerCase();
    if (terms.some(t => sl.includes(t))) {
      return sentence.trim();
    }
  }
  return "";
}

// ─── Pipeline integration helper ─────────────────────────────────────────────
// Call this from the WhatsApp intake handler when a photo is received

export function buildImagePromptAddition(analysis: ClinicalImageAnalysis): string {
  if (analysis.imageQuality === "unusable") {
    return "## PHOTO SUBMITTED (unusable quality — physician assessment required for visual findings)";
  }

  const sections: string[] = [
    `## PHOTO ASSESSMENT [${analysis.complaintSlug.replace(/_/g, " ").toUpperCase()}]`,
    `Quality: ${analysis.imageQuality} | Confidence: ${analysis.confidence}`,
    "",
  ];

  if (analysis.redFlagDetected && analysis.redFlagDescription) {
    sections.push(`### 🚨 RED FLAG IN PHOTO: ${analysis.redFlagDescription}`);
    sections.push("Photo findings suggest IMMEDIATE PHYSICIAN REVIEW required.");
    sections.push("");
  }

  if (analysis.urgencySignals.length > 0) {
    sections.push("### Urgent Findings:");
    analysis.urgencySignals.forEach(s => sections.push(`- ${s}`));
    sections.push("");
  }

  sections.push("### Photo Description:");
  sections.push(analysis.analysisText.slice(0, 600));

  if (analysis.additionalSymptoms.length > 0) {
    sections.push("");
    sections.push(`### Additional findings for differential: ${analysis.additionalSymptoms.join(", ")}`);
  }

  sections.push("");
  sections.push("⚠ Photo assessment supplements but does not replace physical examination. Physician review required.");

  return sections.join("\n");
}
