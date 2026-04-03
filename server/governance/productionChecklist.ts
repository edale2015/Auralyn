export interface DeploymentChecklistItem {
  key: string;
  label: string;
  required: boolean;
  passed: boolean;
  notes?: string;
}

export function evaluateProductionChecklist(
  env: NodeJS.ProcessEnv = process.env
): DeploymentChecklistItem[] {
  return [
    {
      key: "waf_enabled",
      label: "Web Application Firewall enabled",
      required: true,
      passed: env.WAF_ENABLED === "true",
      notes: "AWS WAF or Cloudflare required before production deployment",
    },
    {
      key: "private_db_subnets",
      label: "Database in private subnet (not internet-exposed)",
      required: true,
      passed: env.DB_PRIVATE_SUBNETS === "true",
    },
    {
      key: "tls_1_2_plus",
      label: "TLS 1.2+ enforced on all connections",
      required: true,
      passed: env.TLS_MIN_VERSION === "1.2" || env.TLS_MIN_VERSION === "1.3",
    },
    {
      key: "hipaa_baa_openai_api_only",
      label: "OpenAI calls use standard API only (BAA coverage)",
      required: true,
      passed: env.OPENAI_USE_ASSISTANTS_API !== "true",
      notes: "OpenAI HIPAA BAA covers API but NOT Assistants API beta",
    },
    {
      key: "signed_baas_complete",
      label: "All vendor BAAs signed",
      required: true,
      passed: env.SIGNED_BAAS_COMPLETE === "true",
      notes: "Required: OpenAI, Twilio, Firebase/GCP, Google Workspace, AWS, Upstash",
    },
    {
      key: "audit_retention_7_years",
      label: "Audit log retention ≥ 7 years (2555 days)",
      required: true,
      passed: Number(env.AUDIT_RETENTION_DAYS ?? 0) >= 2555,
    },
    {
      key: "immutable_log_sink",
      label: "Immutable audit log sink (S3 write-once object lock)",
      required: true,
      passed: env.IMMUTABLE_LOG_SINK === "s3_write_once",
    },
    {
      key: "pen_test_complete",
      label: "Third-party penetration test completed",
      required: true,
      passed: env.PEN_TEST_COMPLETE === "true",
      notes: "Required annually and before initial commercial deployment",
    },
    {
      key: "sqlite_phi_deprecated",
      label: "SQLite deprecated for PHI storage",
      required: true,
      passed: env.SQLITE_PHI_DEPRECATED === "true",
      notes: "Hard deadline: 2026-07-02. Migrate all PHI writes to PostgreSQL.",
    },
    {
      key: "scoring_systems_sheet_healthy",
      label: "SCORING_SYSTEMS Google Sheet parses without error",
      required: true,
      passed: env.SCORING_SYSTEMS_SHEET_HEALTHY === "true",
      notes: "Parse failures must halt KB load cycle — not silently ignored",
    },
    {
      key: "physician_review_gate_active",
      label: "Physician review gate active (no autonomous dispositions to patients)",
      required: true,
      passed: env.PHYSICIAN_REVIEW_GATE_DISABLED !== "true",
    },
    {
      key: "validation_lock_available",
      label: "Model validation_lock mechanism configured",
      required: true,
      passed: env.DATABASE_URL !== undefined,
      notes: "governance_flags table must be accessible for model freeze",
    },
  ];
}

export function getProductionReadinessScore(
  env: NodeJS.ProcessEnv = process.env
): { score: number; total: number; failedRequired: string[] } {
  const items = evaluateProductionChecklist(env);
  const required = items.filter(i => i.required);
  const passed = required.filter(i => i.passed);
  const failedRequired = required.filter(i => !i.passed).map(i => i.key);
  return {
    score: passed.length,
    total: required.length,
    failedRequired,
  };
}
