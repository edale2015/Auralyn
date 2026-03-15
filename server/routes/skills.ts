import { Router } from 'express';
import { requireRole } from '../middleware/requireRole';
import { getAllSkills, getSkillById, addSkill, toggleSkill, getSkillsByCategory } from '../core/skills/skillRegistry';

export const skillsRouter = Router();

skillsRouter.get('/', requireRole(['admin', 'physician']), (_req, res) => {
  res.json(getAllSkills());
});

skillsRouter.get('/category/:category', requireRole(['admin', 'physician']), (req, res) => {
  res.json(getSkillsByCategory(req.params.category as any));
});

skillsRouter.get('/:id', requireRole(['admin', 'physician']), (req, res) => {
  const skill = getSkillById(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  res.json(skill);
});

skillsRouter.post('/', requireRole(['admin']), (req, res) => {
  try {
    const skill = addSkill(req.body);
    res.status(201).json(skill);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

skillsRouter.patch('/:id/toggle', requireRole(['admin']), (req, res) => {
  const ok = toggleSkill(req.params.id, req.body.enabled);
  if (!ok) return res.status(404).json({ error: 'Skill not found in custom registry' });
  res.json({ ok: true });
});
