export interface PubMedArticle {
  pmid: string;
  title: string;
  link: string;
  source: string;
}

export interface PubMedSearchResult {
  term: string;
  articles: PubMedArticle[];
  totalResults: number;
  searchedAt: number;
}

export class AutonomousClinicalResearchAgent {
  async search(term: string, maxResults: number = 5): Promise<PubMedSearchResult> {
    try {
      const encoded = encodeURIComponent(term);
      const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=${maxResults}&term=${encoded}`;

      const response = await fetch(url);
      const data = (await response.json()) as any;

      const ids: string[] = data?.esearchresult?.idlist || [];
      const totalResults = parseInt(data?.esearchresult?.count || "0", 10);

      const articles: PubMedArticle[] = ids.map((id) => ({
        pmid: id,
        title: `PubMed Article ${id}`,
        link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        source: "PubMed",
      }));

      if (ids.length > 0) {
        try {
          const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`;
          const summaryRes = await fetch(summaryUrl);
          const summaryData = (await summaryRes.json()) as any;

          articles.forEach((a) => {
            const info = summaryData?.result?.[a.pmid];
            if (info?.title) a.title = info.title;
            if (info?.source) a.source = info.source;
          });
        } catch {}
      }

      return { term, articles, totalResults, searchedAt: Date.now() };
    } catch (err: any) {
      return {
        term,
        articles: [],
        totalResults: 0,
        searchedAt: Date.now(),
      };
    }
  }
}

export const pubmedAgent = new AutonomousClinicalResearchAgent();
