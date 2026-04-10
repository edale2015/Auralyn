export interface HourlyState {
  hour:               number;
  arrivals:           number;
  erCases:            number;
  telemed:            number;
  discharged:         number;
  totalCensus:        number;
  overload:           boolean;
  waitMinutes:        number;
}

export interface SimulationResult {
  hours:              number;
  totalPatients:      number;
  totalER:            number;
  totalTelemed:       number;
  totalDischarged:    number;
  peakCensus:         number;
  overloadHours:      number;
  overloadPct:        number;
  avgWaitMinutes:     number;
  erRate:             number;
  telemedRate:        number;
  timeline:           HourlyState[];
}

const CAPACITY = 200;
const BASE_ARRIVALS_PER_HOUR = 20;

export async function simulateHospital(
  hours = 24,
  opts: { capacity?: number; baseArrivalRate?: number; seed?: number } = {}
): Promise<SimulationResult> {
  const cap         = opts.capacity        ?? CAPACITY;
  const baseArrival = opts.baseArrivalRate ?? BASE_ARRIVALS_PER_HOUR;

  let census     = 0;
  let totalPats  = 0;
  let totalER    = 0;
  let totalTele  = 0;
  let totalDisch = 0;
  let overloadH  = 0;
  let peakCensus = 0;
  let waitSum    = 0;

  const timeline: HourlyState[] = [];

  const rand = opts.seed != null ? seededRandom(opts.seed) : Math.random.bind(Math);

  for (let h = 0; h < hours; h++) {
    const timeOfDay = h % 24;
    const rushFactor = (timeOfDay >= 8 && timeOfDay <= 20) ? 1.5 : 0.7;

    const arrivals  = Math.floor(baseArrival * rushFactor * (0.7 + rand() * 0.6));
    const erCases   = Math.floor(arrivals * (0.15 + rand() * 0.1));
    const telemed   = Math.floor(arrivals * (0.3 + rand() * 0.15));
    const standard  = arrivals - erCases - telemed;
    const discharged = Math.floor(census * (0.1 + rand() * 0.1));

    census  = Math.max(0, census + standard + erCases - discharged);
    peakCensus = Math.max(peakCensus, census);
    totalPats  += arrivals;
    totalER    += erCases;
    totalTele  += telemed;
    totalDisch += discharged;

    const overload = census > cap;
    if (overload) overloadH++;

    const waitMinutes = overload
      ? 60 + Math.floor((census - cap) / 2)
      : Math.floor(10 + (census / cap) * 50);

    waitSum += waitMinutes;

    timeline.push({ hour: h, arrivals, erCases, telemed, discharged, totalCensus: census, overload, waitMinutes });
  }

  return {
    hours,
    totalPatients:   totalPats,
    totalER:         totalER,
    totalTelemed:    totalTele,
    totalDischarged: totalDisch,
    peakCensus,
    overloadHours:   overloadH,
    overloadPct:     Math.round((overloadH / hours) * 100) / 100,
    avgWaitMinutes:  Math.round(waitSum / hours),
    erRate:          totalPats > 0 ? Math.round((totalER / totalPats) * 1000) / 1000 : 0,
    telemedRate:     totalPats > 0 ? Math.round((totalTele / totalPats) * 1000) / 1000 : 0,
    timeline,
  };
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}
