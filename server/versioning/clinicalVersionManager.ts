import crypto from "crypto";
import { addVersion, listVersions, getVersion } from "./clinicalVersionStore";
import { getKnowledgeGraph } from "../knowledge/knowledgeGraphStore";
import { ClinicalVersion } from "./clinicalVersionTypes";

export function createClinicalVersion(config: {
  user?: string;
  description?: string;
  sheets?: any;
  files?: string[];
  summary?: ClinicalVersion["changeSummary"];
}): ClinicalVersion {
  const graph = getKnowledgeGraph();

  const sheetsHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(config.sheets || {}))
    .digest("hex")
    .slice(0, 16);

  const graphHash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ nodes: graph.nodes.length, edges: graph.edges.length }))
    .digest("hex")
    .slice(0, 16);

  const existing = listVersions();
  const versionNum = existing.length + 1;
  const versionId = `cv_${versionNum}_${Date.now()}`;

  const version: ClinicalVersion = {
    id: versionId,
    createdAt: Date.now(),
    createdBy: config.user || "system",
    description: config.description || `Clinical version ${versionNum}`,
    sheetsHash,
    graphHash,
    sheetFiles: config.files || [],
    changeSummary: config.summary,
    status: "draft",
  };

  addVersion(version);
  return version;
}

export function getVersionSummary() {
  const versions = listVersions();
  const deployed = versions.find((v) => v.status === "deployed");

  return {
    totalVersions: versions.length,
    currentDeployed: deployed?.id || null,
    latestVersion: versions[0]?.id || null,
    byStatus: {
      draft: versions.filter((v) => v.status === "draft").length,
      reviewed: versions.filter((v) => v.status === "reviewed").length,
      deployed: versions.filter((v) => v.status === "deployed").length,
      rolled_back: versions.filter((v) => v.status === "rolled_back").length,
    },
  };
}
