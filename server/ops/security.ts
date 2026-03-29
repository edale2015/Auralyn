import { logSecureEvent } from "./secureAudit";

export type SecurityEventType =
  | "UNAUTHORIZED_ACCESS"
  | "BRUTE_FORCE_DETECTED"
  | "SUSPICIOUS_QUERY_PATTERN"
  | "RATE_LIMIT_BREACH"
  | "PHI_ACCESS_WITHOUT_CONSENT"
  | "ADMIN_PRIVILEGE_ESCALATION"
  | "INVALID_TOKEN"
  | "CORS_VIOLATION"
  | "PAYLOAD_TOO_LARGE"
  | "SQL_INJECTION_ATTEMPT"
  | "AUDIT_CHAIN_BROKEN";

export type SecuritySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SecurityEvent {
  eventId: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  ip?: string;
  userId?: string;
  clinicId?: string;
  path?: string;
  detail?: any;
  timestamp: string;
}

const securityLog: SecurityEvent[] = [];
const MAX_LOG = 1000;

const SEVERITY_MAP: Record<SecurityEventType, SecuritySeverity> = {
  UNAUTHORIZED_ACCESS:          "HIGH",
  BRUTE_FORCE_DETECTED:         "CRITICAL",
  SUSPICIOUS_QUERY_PATTERN:     "HIGH",
  RATE_LIMIT_BREACH:            "MEDIUM",
  PHI_ACCESS_WITHOUT_CONSENT:   "CRITICAL",
  ADMIN_PRIVILEGE_ESCALATION:   "CRITICAL",
  INVALID_TOKEN:                "MEDIUM",
  CORS_VIOLATION:               "LOW",
  PAYLOAD_TOO_LARGE:            "LOW",
  SQL_INJECTION_ATTEMPT:        "CRITICAL",
  AUDIT_CHAIN_BROKEN:           "CRITICAL",
};

export function logSecurityEvent(event: {
  type: SecurityEventType;
  ip?: string;
  userId?: string;
  clinicId?: string;
  path?: string;
  detail?: any;
}): SecurityEvent {
  const severity = SEVERITY_MAP[event.type] ?? "MEDIUM";

  const secEvent: SecurityEvent = {
    eventId:   `SEC-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    type:      event.type,
    severity,
    ip:        event.ip,
    userId:    event.userId,
    clinicId:  event.clinicId,
    path:      event.path,
    detail:    event.detail,
    timestamp: new Date().toISOString(),
  };

  securityLog.push(secEvent);
  if (securityLog.length > MAX_LOG) securityLog.shift();

  if (severity === "CRITICAL" || severity === "HIGH") {
    logSecureEvent({ type: "SECURITY_EVENT", ...secEvent });
  }

  console.warn(`[SECURITY] ${secEvent.type} | ${severity} | ${secEvent.eventId}`);
  return secEvent;
}

export function getSecurityEvents(filter?: { severity?: SecuritySeverity; type?: SecurityEventType }): SecurityEvent[] {
  let list = securityLog.slice(-100).reverse();
  if (filter?.severity) list = list.filter((e) => e.severity === filter.severity);
  if (filter?.type)     list = list.filter((e) => e.type === filter.type);
  return list;
}

export function getSecurityStats() {
  const critical = securityLog.filter((e) => e.severity === "CRITICAL").length;
  const high     = securityLog.filter((e) => e.severity === "HIGH").length;
  return {
    active:         true,
    totalEvents:    securityLog.length,
    criticalCount:  critical,
    highCount:      high,
    eventTypes:     Object.keys(SEVERITY_MAP).length,
  };
}
