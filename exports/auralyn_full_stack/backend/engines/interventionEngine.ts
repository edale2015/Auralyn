export function intervene(p: any) {
  if (p.vitals.hr > 110) {
    return ["IV fluids", "labs"];
  }
  return [];
}
