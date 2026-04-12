/**
 * Medical Evidence Retrieval Engine
 * Queries PubMed E-utilities (NCBI) and ClinicalTrials.gov — both free/public APIs.
 * Falls back gracefully when the network is unavailable.
 */

export interface EvidenceResult {
  source:   "PubMed" | "ClinicalTrials";
  query:    string;
  count?:   number;
  items:    unknown[];
  error?:   string;
  fetchedAt:string;
}

async function safeFetch(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "Accept": "application/json" },
    signal:  AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export class EvidenceEngine {
  async searchPubMed(query: string, maxResults = 5): Promise<EvidenceResult> {
    const now = new Date().toISOString();
    try {
      // Step 1: get IDs
      const search = await safeFetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=${maxResults}`
      );
      const ids: string[] = search?.esearchresult?.idlist ?? [];

      if (ids.length === 0) {
        return { source: "PubMed", query, count: 0, items: [], fetchedAt: now };
      }

      // Step 2: fetch summaries
      const summary = await safeFetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`
      );
      const uids: string[] = summary?.result?.uids ?? [];
      const items = uids.map((uid) => {
        const r = summary.result[uid];
        return { pmid: uid, title: r?.title, source: r?.source, pubdate: r?.pubdate };
      });

      return { source: "PubMed", query, count: Number(search?.esearchresult?.count ?? 0), items, fetchedAt: now };
    } catch (err) {
      return { source: "PubMed", query, items: [], error: String(err), fetchedAt: now };
    }
  }

  async searchClinicalTrials(query: string, maxResults = 5): Promise<EvidenceResult> {
    const now = new Date().toISOString();
    try {
      const data = await safeFetch(
        `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(query)}&pageSize=${maxResults}&format=json`
      );
      const studies = (data?.studies ?? []).map((s: any) => ({
        nctId:     s?.protocolSection?.identificationModule?.nctId,
        title:     s?.protocolSection?.identificationModule?.briefTitle,
        status:    s?.protocolSection?.statusModule?.overallStatus,
        phase:     s?.protocolSection?.designModule?.phases?.[0],
        condition: s?.protocolSection?.conditionsModule?.conditions?.[0],
      }));

      return {
        source:    "ClinicalTrials",
        query,
        count:     data?.totalCount ?? studies.length,
        items:     studies,
        fetchedAt: now,
      };
    } catch (err) {
      return { source: "ClinicalTrials", query, items: [], error: String(err), fetchedAt: now };
    }
  }

  async searchGuidelines(query: string): Promise<EvidenceResult[]> {
    return Promise.all([
      this.searchPubMed(query),
      this.searchClinicalTrials(query),
    ]);
  }
}

export const evidenceEngine = new EvidenceEngine();
