/**
 * webSearchFallback.ts — Web search fallback for out-of-scope queries
 *
 * Article (§ "Setting Up WebSearch API"):
 *   "We use SerperAPI for web search. It gives Google search results for a given
 *   query in 1-2 seconds. Its free tier provides 2500 free web search API calls."
 *
 *   "query → Router → ... if not relevant: Go to WebSearch → End"
 *
 * Clinical translation: When neither clinical_guidelines, drug_protocols, nor
 * device_manuals have relevant context (relevance check returns No), the agentic
 * pipeline falls back to a web search. In production this would call SerperAPI
 * or equivalent. This module provides:
 *   - A real fetch-based search via Serper (if SERPER_API_KEY set)
 *   - A curated mock library for testability (keyed on medical topic clusters)
 *   - Fallback to curated mock when API unavailable
 *
 * Importantly, web search results are then re-checked by the relevance checker
 * before being passed to the generator. Iteration cap: 3 attempts max.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface WebSearchResult {
  query:    string;
  context:  string;         // flattened search snippets joined for LLM consumption
  snippets: string[];
  source:   "serper_api" | "mock_library";
  latencyMs: number;
}

// ── Curated mock library ─────────────────────────────────────────────────────
// Keyed on topic clusters — matched by keyword presence in query

const MOCK_RESULTS: Array<{ keywords: string[]; snippets: string[] }> = [
  {
    keywords: ["covid", "coronavirus", "sars-cov-2"],
    snippets: [
      "FDA-authorized COVID-19 treatments include oral antivirals Paxlovid (nirmatrelvir-ritonavir) and Lagevrio (molnupiravir) for high-risk patients within 5 days of symptom onset.",
      "IV antiviral remdesivir (Veklury) is approved for hospitalized COVID-19 patients. For severe disease, baricitinib (Olumiant) and tocilizumab (Actemra) are used.",
      "OTC symptom management: acetaminophen or ibuprofen for fever/pain. Oral antivirals require prescription and are available by appointment at most pharmacies.",
    ],
  },
  {
    keywords: ["tariff", "trade", "export", "import duty", "pharmaceutical export"],
    snippets: [
      "The US imposed 100% tariffs on patented/branded drugs from India starting 2025. India's pharma exports to the US reached $9.8 billion in FY2025.",
      "From August 27, 2025, US tariffs on Indian imports increased up to 50%, among the steepest under recent trade policy. India exported $3.6 billion in pharmaceutical products to the US in 2024.",
    ],
  },
  {
    keywords: ["monkeypox", "mpox", "mpx"],
    snippets: [
      "Mpox (monkeypox) treatment: tecovirimat (TPOXX) is the primary antiviral. JYNNEOS vaccine approved for prevention. Supportive care for lesions: wound care, pain management.",
      "CDC recommends JYNNEOS (2-dose series) for high-risk individuals. Post-exposure prophylaxis within 4 days of exposure with JYNNEOS or ACAM2000.",
    ],
  },
  {
    keywords: ["rsv", "respiratory syncytial virus", "nirsevimab", "palivizumab"],
    snippets: [
      "Nirsevimab (Beyfortus) is approved for RSV prevention in infants and toddlers under 2. Palivizumab (Synagis) for high-risk preterm infants <6 months. Abrysvo vaccine for pregnant women 32-36 weeks gestation.",
      "RSV treatment is supportive: oxygen, hydration, bronchodilators for wheezing. Ribavirin only for severely immunocompromised. Hospitalization for SpO2 <90% or significant respiratory distress.",
    ],
  },
  {
    keywords: ["obesity", "glp-1", "semaglutide", "tirzepatide", "wegovy", "ozempic"],
    snippets: [
      "GLP-1 agonists for obesity: semaglutide (Wegovy) 2.4 mg SC weekly, mean 15-17% weight loss over 68 weeks. Tirzepatide (Zepbound) dual GIP/GLP-1 agonist, 20-22% weight loss.",
      "Contraindications: personal/family history of medullary thyroid carcinoma or MEN2. Side effects: nausea, vomiting, gastroparesis. Monitor pancreatic enzymes.",
    ],
  },
  {
    keywords: ["flu", "influenza", "oseltamivir", "tamiflu"],
    snippets: [
      "Influenza treatment: oseltamivir (Tamiflu) 75 mg BID x5 days, most effective within 48h of symptom onset. Baloxavir (Xofluza) 40-80 mg single dose. For hospitalized: IV peramivir or zanamivir.",
      "2024-25 influenza vaccines include updated H3N2, H1N1, B/Victoria, B/Yamagata components. High-dose flu vaccine recommended for adults ≥65. Vaccination recommended annually for all ≥6 months.",
    ],
  },
];

function findMockResult(query: string): string[] | null {
  const q = query.toLowerCase();
  const match = MOCK_RESULTS.find((m) => m.keywords.some((k) => q.includes(k)));
  return match?.snippets ?? null;
}

// ── Real Serper API call ──────────────────────────────────────────────────────

async function callSerperAPI(query: string): Promise<string[] | null> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;

  try {
    const resp = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 5, gl: "us", hl: "en" }),
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as {
      organic?: Array<{ snippet?: string; title?: string }>;
      answerBox?: { snippet?: string };
    };
    const snippets: string[] = [];
    if (data.answerBox?.snippet) snippets.push(data.answerBox.snippet);
    for (const r of (data.organic ?? []).slice(0, 4)) {
      if (r.snippet) snippets.push(r.snippet);
    }
    return snippets.length > 0 ? snippets : null;
  } catch { return null; }
}

// ── Public interface ──────────────────────────────────────────────────────────

export async function searchWeb(query: string): Promise<WebSearchResult> {
  const t0 = Date.now();

  // Try real API first, fall back to mock
  const apiSnippets = await callSerperAPI(query);
  if (apiSnippets && apiSnippets.length > 0) {
    return {
      query,
      context:   apiSnippets.join("\n"),
      snippets:  apiSnippets,
      source:    "serper_api",
      latencyMs: Date.now() - t0,
    };
  }

  // Fall back to curated mock library
  const mockSnippets = findMockResult(query);
  const snippets = mockSnippets ?? [
    `No specific clinical database entry found for: "${query}". Recommend consulting UpToDate, PubMed, or ClinicalTrials.gov for the most current evidence-based guidance.`,
  ];

  return {
    query,
    context:   snippets.join("\n"),
    snippets,
    source:    "mock_library",
    latencyMs: Date.now() - t0,
  };
}
