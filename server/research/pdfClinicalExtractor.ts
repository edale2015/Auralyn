export interface PDFExtractionResult {
  text: string;
  pages: number;
  wordCount: number;
  sections: PDFSection[];
  extractedAt: string;
}

export interface PDFSection {
  heading: string;
  content: string;
  pageEstimate: number;
}

const CLINICAL_HEADINGS = [
  'Introduction', 'Background', 'Methods', 'Results', 'Discussion',
  'Conclusion', 'Recommendations', 'Indications', 'Contraindications',
  'Dosage', 'Diagnosis', 'Treatment', 'Management', 'Guidelines',
  'Protocol', 'Algorithm', 'Summary', 'Abstract',
];

export async function pdfClinicalExtractor(
  filePathOrText: string,
  mode: 'file' | 'text' = 'text'
): Promise<PDFExtractionResult> {
  let rawText = '';
  let pages = 1;

  if (mode === 'file') {
    try {
      const fs = await import('fs');
      const { default: pdf } = await import('pdf-parse');
      const dataBuffer = fs.readFileSync(filePathOrText);
      const parsed = await (pdf as any)(dataBuffer);
      rawText = parsed.text;
      pages = parsed.numpages;
    } catch {
      rawText = `[PDF extraction unavailable — pdf-parse not installed. Filepath: ${filePathOrText}]`;
    }
  } else {
    rawText = filePathOrText;
  }

  const sections = extractSections(rawText);
  const wordCount = rawText.split(/\s+/).filter(Boolean).length;

  return {
    text: rawText.slice(0, 8000),
    pages,
    wordCount,
    sections,
    extractedAt: new Date().toISOString(),
  };
}

function extractSections(text: string): PDFSection[] {
  const sections: PDFSection[] = [];
  const lines = text.split('\n');

  let currentHeading = 'Preamble';
  let currentLines: string[] = [];
  let pageEstimate = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    const matchedHeading = CLINICAL_HEADINGS.find(
      (h) => trimmed.toLowerCase().startsWith(h.toLowerCase()) && trimmed.length < 60
    );

    if (matchedHeading) {
      if (currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentLines.join(' ').slice(0, 500),
          pageEstimate,
        });
      }
      currentHeading = trimmed;
      currentLines = [];
      pageEstimate++;
    } else {
      currentLines.push(trimmed);
    }
  }

  if (currentLines.length > 0) {
    sections.push({ heading: currentHeading, content: currentLines.join(' ').slice(0, 500), pageEstimate });
  }

  return sections.slice(0, 15);
}
