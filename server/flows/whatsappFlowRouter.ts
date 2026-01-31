// server/flows/whatsappFlowRouter.ts

export type FlowPick = {
  system: string;
  specialty: string;
  complaint: string;
  flowId: string;
};

export type RouterAudit = {
  routerPickedFlowId: string;
  routerReason: "menu" | "keyword" | "default";
  routerTextSnippet: string;
  routerPickedAt: string;
};

const DEFAULT_FLOW: FlowPick = {
  system: "ENT",
  specialty: "ENT",
  complaint: "FLU_LIKE_URI",
  flowId: "ENT_FLU_LIKE_V1",
};

// Conservative "hard stop" first
function containsAny(t: string, terms: string[]) {
  return terms.some((x) => t.includes(x));
}

export function routeFlowFromText(raw: string): FlowPick {
  const t = (raw || "").toLowerCase().trim();

  // EMERG hard stop
  if (
    containsAny(t, [
      "no pulse",
      "not breathing",
      "unresponsive",
      "turning blue",
      "severe bleeding",
      "bleeding won't stop",
      "call 911",
      "cant breathe",
      "can't breathe",
    ])
  ) {
    return { system: "EMERG", specialty: "EMERG", complaint: "CRITICAL_EMERGENCY", flowId: "EMERG_CRITICAL_V1" };
  }

  // Major trauma
  if (
    containsAny(t, [
      "car crash",
      "mva",
      "motor vehicle",
      "rollover",
      "ejection",
      "hit by car",
      "fall from",
      "fell from",
      "gunshot",
      "stab",
      "penetrating",
      "major trauma",
    ])
  ) {
    return { system: "TRAUMA", specialty: "TRAUMA", complaint: "MAJOR_TRAUMA", flowId: "TRAUMA_MAJOR_V1" };
  }

  // --- HIGH RISK ROUTES (before general symptom routing) ---

  // Pregnancy bleeding / possible ectopic
  if (
    containsAny(t, ["pregnan", "positive test", "postpartum"]) &&
    containsAny(t, ["bleed", "spot", "clot"])
  ) {
    return { system: "UROGYN", specialty: "UROGYN", complaint: "VAGINAL_BLEEDING", flowId: "UROGYN_VAGINAL_BLEEDING_V1" };
  }

  // Sudden severe testicular pain (torsion until proven otherwise)
  if (
    containsAny(t, ["testicle", "testicular", "scrot", "ball pain"]) &&
    containsAny(t, ["sudden", "suddenly", "severe", "worst"])
  ) {
    return { system: "UROGYN", specialty: "UROGYN", complaint: "TESTICULAR_PAIN", flowId: "UROGYN_TESTICULAR_PAIN_V1" };
  }

  // Vision loss (emergency ophth)
  if (containsAny(t, ["vision loss", "lost vision", "can't see", "cant see", "blind", "curtain", "floaters", "flashes"])) {
    return { system: "OPHTH", specialty: "OPHTH", complaint: "VISION_LOSS", flowId: "OPHTH_VISION_LOSS_V1" };
  }

  // Worst headache / thunderclap (possible SAH)
  if (containsAny(t, ["worst headache", "thunderclap", "sudden severe headache"])) {
    return { system: "NEURO", specialty: "NEURO", complaint: "HEADACHE", flowId: "NEURO_HEADACHE_V1" };
  }

  // Stroke symptoms
  if (containsAny(t, ["face droop", "slurred", "can't speak", "cant speak", "one sided", "weakness", "numbness", "stroke"])) {
    return { system: "NEURO", specialty: "NEURO", complaint: "WEAKNESS_NEURO", flowId: "NEURO_WEAKNESS_V1" };
  }

  // --- END HIGH RISK ROUTES ---

  // Cardio
  if (containsAny(t, ["chest pain", "chest pressure", "tightness", "pain in chest", "radiat"])) {
    return { system: "CARDIO", specialty: "CARDIO", complaint: "CHEST_PAIN", flowId: "CARDIO_CHEST_PAIN_V1" };
  }
  if (containsAny(t, ["palpitation", "heart racing", "skipping beats", "tachy"])) {
    return { system: "CARDIO", specialty: "CARDIO", complaint: "PALPITATIONS", flowId: "CARDIO_PALPITATIONS_V1" };
  }
  if (containsAny(t, ["faint", "passed out", "syncope", "blackout"])) {
    return { system: "CARDIO", specialty: "CARDIO", complaint: "SYNCOPE", flowId: "CARDIO_SYNCOPE_V1" };
  }

  // Pulm
  if (containsAny(t, ["shortness of breath", "sob", "wheez", "asthma", "can't breathe", "cant breathe"])) {
    return { system: "PULMONARY", specialty: "PULMONARY", complaint: "SHORTNESS_OF_BREATH", flowId: "PULM_SOB_V1" };
  }
  if (containsAny(t, ["cough"])) {
    return { system: "PULMONARY", specialty: "PULMONARY", complaint: "COUGH", flowId: "PULM_COUGH_V1" };
  }

  // UROGYN
  if (containsAny(t, ["uti", "burning pee", "burning when i pee", "dysuria", "urination pain", "frequency", "urgency", "peeing a lot"])) {
    return { system: "UROGYN", specialty: "UROGYN", complaint: "UTI_DYSURIA", flowId: "UROGYN_DYSURIA_UTI_V1" };
  }
  if (containsAny(t, ["vaginal bleeding", "bleeding", "spotting"]) && containsAny(t, ["vag", "period", "preg"])) {
    return { system: "UROGYN", specialty: "UROGYN", complaint: "VAGINAL_BLEEDING", flowId: "UROGYN_VAGINAL_BLEEDING_V1" };
  }
  if (containsAny(t, ["testicle", "scrot", "ball pain"])) {
    return { system: "UROGYN", specialty: "UROGYN", complaint: "TESTICULAR_PAIN", flowId: "UROGYN_TESTICULAR_PAIN_V1" };
  }

  // Derm/Env quick hits
  if (containsAny(t, ["rash", "hives", "itch", "welts"])) {
    return { system: "DERM", specialty: "DERM", complaint: "RASH", flowId: "DERM_RASH_V1" };
  }
  if (containsAny(t, ["burn", "scald", "scalded"])) {
    return { system: "DERM", specialty: "DERM", complaint: "BURNS", flowId: "DERM_BURNS_V1" };
  }
  if (containsAny(t, ["bite", "sting"])) {
    return { system: "ENVIRONMENTAL", specialty: "ENVIRONMENTAL", complaint: "BITE_STING", flowId: "ENV_BITE_STING_V1" };
  }

  // Ortho generic
  if (containsAny(t, ["back pain", "knee", "ankle", "shoulder", "hip", "fell", "injury", "sprain"])) {
    return { system: "ORTHO", specialty: "ORTHO", complaint: "BACK_PAIN", flowId: "ORTHO_BACK_PAIN_V1" };
  }

  return DEFAULT_FLOW;
}

export function menuText(): string {
  return [
    "What can we help with today? Reply with a number:",
    "1) Chest pain / palpitations / fainting",
    "2) Cough / shortness of breath / flu",
    "3) UTI / pelvic / discharge / bleeding",
    "4) Rash / burns / bites / wounds",
    "5) Injury (fall, back, shoulder, etc.)",
    "6) Other (describe in one sentence)",
  ].join("\n");
}

export function flowFromMenuChoice(choice: string): FlowPick | null {
  const c = (choice || "").trim();
  switch (c) {
    case "1":
      return { system: "CARDIO", specialty: "CARDIO", complaint: "CHEST_PAIN", flowId: "CARDIO_CHEST_PAIN_V1" };
    case "2":
      return { system: "PULMONARY", specialty: "PULMONARY", complaint: "COUGH", flowId: "PULM_COUGH_V1" };
    case "3":
      return { system: "UROGYN", specialty: "UROGYN", complaint: "UTI_DYSURIA", flowId: "UROGYN_DYSURIA_UTI_V1" };
    case "4":
      return { system: "DERM", specialty: "DERM", complaint: "RASH", flowId: "DERM_RASH_V1" };
    case "5":
      return { system: "ORTHO", specialty: "ORTHO", complaint: "BACK_PAIN", flowId: "ORTHO_BACK_PAIN_V1" };
    case "6":
      // We'll ask them to describe; keep encounter open and let router pick next message
      return null;
    default:
      return null;
  }
}

export function getAnswersObj(answers: any): any {
  try {
    if (!answers) return {};
    if (typeof answers === "string") return JSON.parse(answers);
    return answers;
  } catch {
    return {};
  }
}

export function setMenuState(answersObj: any, state: { awaitingChoice?: boolean; awaitingOtherText?: boolean } = {}) {
  const a = answersObj || {};
  a.__menu = {
    awaitingChoice: state.awaitingChoice ?? false,
    awaitingOtherText: state.awaitingOtherText ?? false,
    ts: Date.now(),
  };
  return a;
}

export function isAwaitingOtherText(answersObj: any): boolean {
  return Boolean(answersObj?.__menu?.awaitingOtherText);
}

export function isAwaitingChoice(answersObj: any): boolean {
  return Boolean(answersObj?.__menu?.awaitingChoice);
}

export function isMenuResetCommand(msg: string): boolean {
  const t = (msg || "").toLowerCase().trim();
  return ["menu", "change", "restart", "switch", "topic", "change my topic", "start over"].includes(t);
}

export function isStatusCommand(msg: string): boolean {
  const t = (msg || "").toLowerCase().trim();
  return ["link", "code", "status", "resend", "resend link", "resend code"].includes(t);
}

export function buildRouterAudit(
  flowId: string,
  reason: "menu" | "keyword" | "default" | "other_text",
  text: string
): RouterAudit {
  return {
    routerPickedFlowId: flowId,
    routerReason: reason,
    routerTextSnippet: (text || "").substring(0, 60),
    routerPickedAt: new Date().toISOString(),
  };
}

export type RouterAuditInput = {
  routerReason: "menu" | "keyword" | "other_text";
  routerPickedFlowId: string;
  routerPickedSystem?: string;
  routerTextSnippet: string;
};

// Sets both __routerAudit and __router alias on answers object
export function setRouterAudit(answersObj: any, audit: RouterAuditInput): any {
  const a = answersObj || {};
  const ts = Date.now();

  // Canonical schema
  a.__routerAudit = {
    routerReason: audit.routerReason,
    routerPickedFlowId: audit.routerPickedFlowId,
    routerPickedSystem: audit.routerPickedSystem || "",
    routerTextSnippet: audit.routerTextSnippet,
    ts,
  };

  // Compatibility alias
  a.__router = {
    source: audit.routerReason,
    pickedFlowId: audit.routerPickedFlowId,
    pickedSystem: audit.routerPickedSystem || "",
    snippet: audit.routerTextSnippet,
    ts,
  };

  return a;
}
