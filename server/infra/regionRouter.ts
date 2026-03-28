export type SupportedRegion = "US" | "CA" | "EU" | "UK" | "APAC";

export interface RegionConfig {
  region: SupportedRegion;
  db: string;
  storage: string;
  dataResidency: string;
  hipaaCompliant: boolean;
  gdprCompliant: boolean;
  latencyTargetMs: number;
}

const REGION_MAP: Record<string, RegionConfig> = {
  US: { region: "US",   db: "us-east-1",  storage: "us-standard",   dataResidency: "United States",    hipaaCompliant: true,  gdprCompliant: false, latencyTargetMs: 50  },
  CA: { region: "CA",   db: "ca-central", storage: "canada-central", dataResidency: "Canada",           hipaaCompliant: true,  gdprCompliant: false, latencyTargetMs: 70  },
  EU: { region: "EU",   db: "eu-west-1",  storage: "eu-standard",   dataResidency: "European Union",   hipaaCompliant: false, gdprCompliant: true,  latencyTargetMs: 80  },
  UK: { region: "UK",   db: "eu-west-2",  storage: "uk-south",      dataResidency: "United Kingdom",   hipaaCompliant: false, gdprCompliant: true,  latencyTargetMs: 90  },
  APAC: { region: "APAC", db: "ap-southeast-1", storage: "apac-east", dataResidency: "Asia-Pacific",  hipaaCompliant: false, gdprCompliant: false, latencyTargetMs: 120 },
};

export function getRegionConfig(country: string): RegionConfig {
  const countryUpper = country.toUpperCase();
  if (countryUpper in REGION_MAP) return REGION_MAP[countryUpper as SupportedRegion];

  const EU_COUNTRIES = ["DE", "FR", "IT", "ES", "NL", "BE", "PL", "SE", "AT", "CH"];
  if (EU_COUNTRIES.includes(countryUpper)) return REGION_MAP["EU"];

  return REGION_MAP["US"];
}

export function listRegions(): RegionConfig[] {
  return Object.values(REGION_MAP);
}

export function getRegionSummary() {
  return {
    active: true,
    supportedRegions: Object.keys(REGION_MAP).length,
    regions: Object.keys(REGION_MAP),
    hipaaRegions: Object.values(REGION_MAP).filter((r) => r.hipaaCompliant).map((r) => r.region),
    gdprRegions: Object.values(REGION_MAP).filter((r) => r.gdprCompliant).map((r) => r.region),
  };
}
