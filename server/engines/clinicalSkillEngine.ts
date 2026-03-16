import { getSkillsForComplaint } from '../brain/skillGraph';

export class ClinicalSkillEngine {
  readonly name = 'clinicalSkillEngine';

  run(context: any): any {
    const complaint = (context.complaint ?? '').toLowerCase().replace(/[\s-]+/g, '_');
    const skills = getSkillsForComplaint(complaint);
    const critical = skills.filter((s) => s.priority === 'critical').map((s) => s.skill);
    const requiredEngines = [...new Set(skills.flatMap((s) => s.relatedEngines))];

    return {
      ...context,
      requiredSkills: skills.map((s) => s.skill),
      criticalSkills: critical,
      skillEnginesRequired: requiredEngines,
      skillResolutionComplete: true,
    };
  }
}
