export function insight(p: any) {
  return {
    risk:   p.vitals.hr > 110 ? "high" : "low",
    action: "monitor"
  };
}
