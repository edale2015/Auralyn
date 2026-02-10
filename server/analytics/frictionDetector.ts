export interface FrictionSignal {
  type: "profanity" | "refusal" | "off_topic" | "rambling";
  severity: "low" | "medium" | "high";
  message: string;
  stepNo?: number;
}

const PROFANITY_PATTERNS = [
  /\b(damn|hell|crap|shit|fuck|ass|bitch|bastard|piss|dick)\b/i,
  /\b(stfu|wtf|gtfo|idiot|stupid|dumb)\b/i,
];

const REFUSAL_PATTERNS = [
  /\b(not answering|stop asking|none of your business|leave me alone|go away)\b/i,
  /\b(i refuse|won't answer|don't want to|skip this|no comment)\b/i,
  /\b(mind your own|that's private|too personal)\b/i,
];

const OFF_TOPIC_PATTERNS = [
  /\b(what's the weather|sports|politics|recipe|joke|game)\b/i,
  /\b(are you a robot|who made you|tell me about yourself)\b/i,
];

const RAMBLING_THRESHOLD = 500;

export function detectFriction(messageText: string, stepNo?: number): FrictionSignal[] {
  const signals: FrictionSignal[] = [];

  for (const pattern of PROFANITY_PATTERNS) {
    if (pattern.test(messageText)) {
      signals.push({
        type: "profanity",
        severity: "high",
        message: `Profanity detected in patient response`,
        stepNo,
      });
      break;
    }
  }

  for (const pattern of REFUSAL_PATTERNS) {
    if (pattern.test(messageText)) {
      signals.push({
        type: "refusal",
        severity: "medium",
        message: `Refusal phrase detected: patient unwilling to answer`,
        stepNo,
      });
      break;
    }
  }

  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(messageText)) {
      signals.push({
        type: "off_topic",
        severity: "low",
        message: `Off-topic reply detected`,
        stepNo,
      });
      break;
    }
  }

  if (messageText.length > RAMBLING_THRESHOLD) {
    signals.push({
      type: "rambling",
      severity: "low",
      message: `Very long message (${messageText.length} chars)`,
      stepNo,
    });
  }

  return signals;
}

export function detectFrictionInConversation(
  messages: Array<{ text: string; stepNo?: number; from: "patient" | "system" }>
): FrictionSignal[] {
  const signals: FrictionSignal[] = [];
  const questionsSeen = new Map<string, number>();

  for (const msg of messages) {
    if (msg.from !== "patient") {
      const normalized = msg.text.toLowerCase().trim().slice(0, 100);
      questionsSeen.set(normalized, (questionsSeen.get(normalized) ?? 0) + 1);
      continue;
    }
    signals.push(...detectFriction(msg.text, msg.stepNo));
  }

  return signals;
}
