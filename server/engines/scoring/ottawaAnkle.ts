export interface OttawaAnkleInput {
  boneTendernessPosteriorMalleolus: boolean;
  boneTendernessBaseFifthMetatarsal: boolean;
  boneTendernessNavicular: boolean;
  unableToWeightBear: boolean;
}

export interface OttawaAnkleResult {
  needsXray: boolean;
  recommendation: string;
  components: { criterion: string; present: boolean }[];
}

export function calculateOttawaAnkle(input: OttawaAnkleInput): OttawaAnkleResult {
  const components = [
    { criterion: "Bone tenderness at posterior edge or tip of lateral malleolus", present: input.boneTendernessPosteriorMalleolus },
    { criterion: "Bone tenderness at base of 5th metatarsal", present: input.boneTendernessBaseFifthMetatarsal },
    { criterion: "Bone tenderness at navicular", present: input.boneTendernessNavicular },
    { criterion: "Unable to weight-bear (4 steps) immediately and in ED", present: input.unableToWeightBear },
  ];

  const needsXray = components.some((c) => c.present);

  return {
    needsXray,
    recommendation: needsXray
      ? "X-ray indicated based on Ottawa Ankle Rules"
      : "X-ray not indicated — low probability of fracture",
    components,
  };
}
