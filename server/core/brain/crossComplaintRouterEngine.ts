export function runCrossComplaintRouterEngine(symptoms: string[]): string[] {
  const set = new Set(symptoms);
  const routes = new Set<string>();
  if (set.has('syncope')) routes.add('chest_pain');
  if (set.has('flank_pain')) routes.add('dysuria');
  if (set.has('neck_stiffness')) routes.add('headache');
  if (set.has('pelvic_pain')) routes.add('pregnancy_problem');
  return [...routes];
}
