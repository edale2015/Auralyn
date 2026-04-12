export function rank(patients: any[]) {
  return patients.sort((a, b) => b.vitals.hr - a.vitals.hr);
}
