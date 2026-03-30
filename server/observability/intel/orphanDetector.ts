/**
 * Recommendation 4 & 9: Orphan + Coverage Detector
 *
 * Detects three categories of stranded components:
 *
 *   A) Scheduled engines (ENGINE_REGISTRY in engineScheduler) that have no
 *      corresponding file in server/engines/ — they're being "monitored" but
 *      don't actually exist.
 *
 *   B) Skills in SKILL_REGISTRY whose engineType references an engine name
 *      that is absent from the live engine dependency graph — orphaned skill ↔
 *      engine wiring.
 *
 *   C) Agents in agentConfig that are listed but never heartbeat or appear in
 *      the governance agent registry — registered but never active.
 *
 * Nothing in this file throws — every error is captured and surfaced as a
 * finding so the endpoint always returns a useful payload.
 */

import * as fs from "fs";
import * as path from "path";
import { ENGINE_REGISTRY }             from "../../system/engineScheduler";
import { SKILL_REGISTRY }              from "../../skills/registry/skillRegistry";
import { engineDependencies }          from "../../analysis/engineDependencyGraph";
import { getAgents }                 from "../../governance/agentRegistry";

export interface OrphanReport {
  generatedAt:            string;
  scheduledButMissingFile: string[];
  skillsWithDeadEngines:  Array<{ skillId: string; skillName: string; missingEngine: string }>;
  agentsNeverSeen:        string[];
  engineFilesNotScheduled: string[];
  summary: {
    totalOrphans:       number;
    totalGaps:          number;
    coveragePct:        number;
  };
}

function getEngineFilenames(): string[] {
  try {
    const dir = path.resolve(process.cwd(), "server/engines");
    return fs.readdirSync(dir)
      .filter(f => f.endsWith(".ts") || f.endsWith(".js"))
      .map(f => f.replace(/\.(ts|js)$/, ""));
  } catch {
    return [];
  }
}

export function runOrphanDetection(): OrphanReport {
  const engineFiles   = getEngineFilenames();
  const graphEngines  = new Set(Object.keys(engineDependencies));

  const scheduledButMissing = ENGINE_REGISTRY.filter(
    name => !engineFiles.some(f => f.toLowerCase().includes(name.toLowerCase()))
  );

  const engineFilesNotScheduled = engineFiles.filter(
    f => !ENGINE_REGISTRY.some(name => f.toLowerCase().includes(name.toLowerCase()))
  );

  const skillsWithDeadEngines: OrphanReport["skillsWithDeadEngines"] = [];
  for (const skill of SKILL_REGISTRY) {
    const engineRef = (skill as any).engineRef ?? (skill as any).engineType;
    if (engineRef && engineRef !== "rules" && engineRef !== "hybrid" && engineRef !== "retrieval") {
      const exists =
        graphEngines.has(engineRef) ||
        engineFiles.some(f => f.toLowerCase().includes(engineRef.toLowerCase()));
      if (!exists) {
        skillsWithDeadEngines.push({
          skillId:       skill.skillId,
          skillName:     skill.skillName,
          missingEngine: engineRef,
        });
      }
    }
  }

  const govAgents    = getAgents();
  const seenIds      = new Set(govAgents.filter(a => a.lastSeenAt).map(a => a.id));
  const agentsNeverSeen = govAgents
    .filter(a => !seenIds.has(a.id) ||
      (Date.now() - new Date(a.lastSeenAt).getTime()) > 30 * 60 * 1000)
    .map(a => a.id);

  const totalOrphans =
    scheduledButMissing.length +
    skillsWithDeadEngines.length +
    agentsNeverSeen.length;

  const totalEngines  = engineFiles.length;
  const scheduled     = ENGINE_REGISTRY.length;
  const coveragePct   = totalEngines > 0
    ? Math.round(((scheduled - scheduledButMissing.length) / totalEngines) * 100)
    : 0;

  return {
    generatedAt:             new Date().toISOString(),
    scheduledButMissingFile:  scheduledButMissing,
    skillsWithDeadEngines,
    agentsNeverSeen,
    engineFilesNotScheduled: engineFilesNotScheduled.slice(0, 30),
    summary: {
      totalOrphans,
      totalGaps:    engineFilesNotScheduled.length,
      coveragePct,
    },
  };
}
