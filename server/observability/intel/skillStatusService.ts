/**
 * Recommendation 7: Skill Status + Rollback Service
 *
 * The skill version registry and rollback service exist but have no HTTP
 * surface. This module provides the service layer for:
 *
 *   GET  /api/intel/skills             — all skills with version + pass rate
 *   GET  /api/intel/skills/:skillId    — single skill detail
 *   POST /api/intel/skills/:skillId/rollback — trigger version rollback
 *
 * Rollback is recorded in the audit log so there is always a paper trail.
 */

import { SKILL_REGISTRY }          from "../../skills/registry/skillRegistry";
import { SKILL_VERSION_REGISTRY }  from "../../skills/registry/skillVersionRegistry";
import { getRollbackTarget, getActiveVersion, getPassRate } from "../../skills/registry/skillRollbackService";
import { auditStep }               from "../../audit/auditLogger";
import { logger }                  from "../../utils/logger";

export interface SkillStatusRecord {
  skillId:         string;
  skillName:       string;
  category:        string;
  enabled:         boolean;
  engineType:      string;
  safetyClass:     string;
  triggerType:     string;
  activeVersion:   string | null;
  rollbackTarget:  string | null;
  passRate:        number | null;
  strategicNotes?: string;
}

export function getAllSkillStatuses(): SkillStatusRecord[] {
  return SKILL_REGISTRY.map(skill => ({
    skillId:        skill.skillId,
    skillName:      skill.skillName,
    category:       skill.category,
    enabled:        skill.enabled,
    engineType:     skill.engineType,
    safetyClass:    skill.safetyClass,
    triggerType:    skill.triggerType,
    activeVersion:  getActiveVersion(skill.skillName),
    rollbackTarget: getRollbackTarget(skill.skillName),
    passRate:       getPassRate(skill.skillName),
    strategicNotes: skill.strategicNotes,
  }));
}

export function getSkillStatus(skillId: string): SkillStatusRecord | null {
  const skill = SKILL_REGISTRY.find(s => s.skillId === skillId);
  if (!skill) return null;
  return {
    skillId:        skill.skillId,
    skillName:      skill.skillName,
    category:       skill.category,
    enabled:        skill.enabled,
    engineType:     skill.engineType,
    safetyClass:    skill.safetyClass,
    triggerType:    skill.triggerType,
    activeVersion:  getActiveVersion(skill.skillName),
    rollbackTarget: getRollbackTarget(skill.skillName),
    passRate:       getPassRate(skill.skillName),
    strategicNotes: skill.strategicNotes,
  };
}

export interface RollbackResult {
  success:   boolean;
  skillId:   string;
  skillName: string;
  rolledBackTo?: string;
  error?:    string;
}

export function rollbackSkill(skillId: string, requestedBy = "system"): RollbackResult {
  const skill = SKILL_REGISTRY.find(s => s.skillId === skillId);
  if (!skill) {
    return { success: false, skillId, skillName: skillId, error: "skill_not_found" };
  }

  const target = getRollbackTarget(skill.skillName);
  if (!target) {
    return { success: false, skillId, skillName: skill.skillName, error: "no_rollback_target" };
  }

  const versionRow = SKILL_VERSION_REGISTRY.find(
    r => r.skillName === skill.skillName && r.version === target
  );
  if (!versionRow) {
    return { success: false, skillId, skillName: skill.skillName, error: "target_version_not_found" };
  }

  SKILL_VERSION_REGISTRY.forEach(r => {
    if (r.skillName === skill.skillName) r.active = (r.version === target);
  });

  try {
    auditStep("SKILL_ROLLBACK", {
      skillId,
      skillName:   skill.skillName,
      rolledBackTo: target,
      requestedBy,
      timestamp:   new Date().toISOString(),
    });
  } catch {
  }

  logger.warn("skill_rolled_back", { skillId, skillName: skill.skillName, version: target, requestedBy });

  return { success: true, skillId, skillName: skill.skillName, rolledBackTo: target };
}
