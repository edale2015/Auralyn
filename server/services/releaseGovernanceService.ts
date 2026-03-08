export interface ReleaseGate {
  gateId: string;
  name: string;
  status: "pass" | "fail" | "pending" | "skipped";
  details?: string;
  checkedAt?: string;
}

export interface ReleaseCandidate {
  version: string;
  createdAt: string;
  status: "draft" | "testing" | "approved" | "released" | "rolled_back";
  gates: ReleaseGate[];
  approvedBy?: string;
}

const releases: ReleaseCandidate[] = [
  {
    version: "1.0.0",
    createdAt: new Date().toISOString(),
    status: "released",
    gates: [
      { gateId: "unit_tests", name: "Unit Tests", status: "pass", checkedAt: new Date().toISOString() },
      { gateId: "integration", name: "Integration Tests", status: "pass", checkedAt: new Date().toISOString() },
      { gateId: "clinical_validation", name: "Clinical Validation", status: "pass", checkedAt: new Date().toISOString() },
      { gateId: "security_scan", name: "Security Scan", status: "pass", checkedAt: new Date().toISOString() },
    ],
  },
];

export function listReleases(): ReleaseCandidate[] { return [...releases].reverse(); }

export function createRelease(version: string): ReleaseCandidate {
  const rc: ReleaseCandidate = {
    version,
    createdAt: new Date().toISOString(),
    status: "draft",
    gates: [
      { gateId: "unit_tests", name: "Unit Tests", status: "pending" },
      { gateId: "integration", name: "Integration Tests", status: "pending" },
      { gateId: "clinical_validation", name: "Clinical Validation", status: "pending" },
      { gateId: "security_scan", name: "Security Scan", status: "pending" },
      { gateId: "performance", name: "Performance Tests", status: "pending" },
      { gateId: "physician_signoff", name: "Physician Sign-off", status: "pending" },
    ],
  };
  releases.push(rc);
  return rc;
}

export function updateGate(version: string, gateId: string, status: ReleaseGate["status"]): ReleaseCandidate | null {
  const rc = releases.find((r) => r.version === version);
  if (!rc) return null;
  const gate = rc.gates.find((g) => g.gateId === gateId);
  if (!gate) return null;
  gate.status = status;
  gate.checkedAt = new Date().toISOString();
  if (rc.gates.every((g) => g.status === "pass")) rc.status = "approved";
  return rc;
}
