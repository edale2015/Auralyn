import { pubmedAgent } from "../../research/pubmedAgent";

export interface IntegrationResult {
  source: string;
  data: any;
  fetchedAt: number;
}

export class IntegrationLayer {
  async fetchResearch(term: string): Promise<IntegrationResult> {
    const result = await pubmedAgent.search(term);
    return {
      source: "pubmed",
      data: result,
      fetchedAt: Date.now(),
    };
  }
}

export const integrationLayer = new IntegrationLayer();
