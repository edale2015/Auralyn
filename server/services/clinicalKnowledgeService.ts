/**
 * Clinical knowledge base service.
 *
 * Full-text search over the `clinical_knowledge` table using
 * PostgreSQL's tsvector / tsquery.  Results are ordered by
 * recency and returned capped at 5 entries.
 */

import { db }  from "../db";
import { sql } from "drizzle-orm";

export type ClinicalKnowledgeRow = {
  id:        number;
  title:     string;
  content:   string;
  category:  string;
  source:    string;
  updatedAt: Date | null;
};

/**
 * Search the clinical knowledge base using full-text search.
 * Returns up to 5 ranked results.
 */
export async function searchClinicalKnowledge(
  query: string,
): Promise<ClinicalKnowledgeRow[]> {
  const tsQuery = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `${t.replace(/[^a-z0-9]/gi, "")}:*`)
    .join(" & ");

  if (!tsQuery) return [];

  const rows = await db.execute(sql`
    SELECT
      id,
      title,
      content,
      category,
      source,
      updated_at AS "updatedAt"
    FROM clinical_knowledge
    WHERE to_tsvector('english', title || ' ' || content)
      @@ to_tsquery('english', ${tsQuery})
    ORDER BY updated_at DESC
    LIMIT 5
  `);

  return rows.rows as ClinicalKnowledgeRow[];
}

/**
 * Insert a new knowledge base entry.
 */
export async function insertKnowledgeEntry(entry: {
  title:    string;
  content:  string;
  category: string;
  source:   string;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO clinical_knowledge (title, content, category, source)
    VALUES (${entry.title}, ${entry.content}, ${entry.category}, ${entry.source})
  `);
}
