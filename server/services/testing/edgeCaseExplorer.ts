export interface EdgeCase {
  id: string;
  description: string;
  scenario: Record<string, unknown>;
  expectedBehavior: string;
  category: "boundary" | "contradiction" | "missing_data" | "extreme_values";
}

export function generateEdgeCases(complaintId: string): EdgeCase[] {
  return [
    { id: `ec_${complaintId}_1`, description: "All answers positive", scenario: { allPositive: true }, expectedBehavior: "Should trigger highest acuity", category: "boundary" },
    { id: `ec_${complaintId}_2`, description: "All answers negative", scenario: { allNegative: true }, expectedBehavior: "Should result in low acuity", category: "boundary" },
    { id: `ec_${complaintId}_3`, description: "No answers provided", scenario: {}, expectedBehavior: "Should handle gracefully", category: "missing_data" },
    { id: `ec_${complaintId}_4`, description: "Contradictory symptoms", scenario: { fever: true, hypothermia: true }, expectedBehavior: "Should flag contradiction", category: "contradiction" },
    { id: `ec_${complaintId}_5`, description: "Extreme age", scenario: { age: 120 }, expectedBehavior: "Should handle extreme values", category: "extreme_values" },
  ];
}
