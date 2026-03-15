export interface LiteratureResult {
  source: string;
  query: string;
  records: LiteratureRecord[];
  fetchedAt: string;
}

export interface LiteratureRecord {
  id: string;
  title: string;
  abstract?: string;
  authors?: string[];
  journal?: string;
  year?: number;
  pmid?: string;
  url: string;
}

export async function literatureScraperEngine(query: string): Promise<LiteratureResult> {
  const encoded = encodeURIComponent(query);
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encoded}&retmax=10&retmode=json&sort=relevance`;

  let pmids: string[] = [];

  try {
    const { default: fetch } = await import('node-fetch');
    const searchRes = await (fetch as any)(searchUrl);
    if (searchRes.ok) {
      const searchJson: any = await searchRes.json();
      pmids = searchJson?.esearchresult?.idlist ?? [];
    }
  } catch {
    // network unavailable — return empty scaffold
  }

  const records: LiteratureRecord[] = pmids.slice(0, 10).map((pmid, i) => ({
    id: `pubmed_${pmid}`,
    title: `PubMed Article #${pmid}`,
    pmid,
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
  }));

  return {
    source: 'pubmed',
    query,
    records,
    fetchedAt: new Date().toISOString(),
  };
}
