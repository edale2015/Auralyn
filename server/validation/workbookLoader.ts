import * as XLSX from "xlsx";

export interface LoadedSheet {
  name: string;
  headers: string[];
  rows: Record<string, any>[];
}

export interface LoadedWorkbook {
  sheetNames: string[];
  sheets: Record<string, LoadedSheet>;
}

function normalizeHeader(value: any): string {
  return String(value ?? "").trim();
}

export function loadWorkbookFromFile(filePath: string): LoadedWorkbook {
  const workbook = XLSX.readFile(filePath, { cellDates: true });

  const result: LoadedWorkbook = {
    sheetNames: workbook.SheetNames,
    sheets: {},
  };

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      blankrows: false,
      defval: null,
    });

    if (!rawRows.length) {
      result.sheets[sheetName] = {
        name: sheetName,
        headers: [],
        rows: [],
      };
      continue;
    }

    const headers = (rawRows[0] || [])
      .map(normalizeHeader)
      .filter((h: string) => h.length > 0);

    const rows = rawRows.slice(1).map((row) => {
      const obj: Record<string, any> = {};
      headers.forEach((header, idx) => {
        obj[header] = row[idx] ?? null;
      });
      return obj;
    });

    result.sheets[sheetName] = {
      name: sheetName,
      headers,
      rows,
    };
  }

  return result;
}

export function loadWorkbookFromBuffer(buffer: Buffer): LoadedWorkbook {
  const workbook = XLSX.read(buffer, { cellDates: true, type: "buffer" });

  const result: LoadedWorkbook = {
    sheetNames: workbook.SheetNames,
    sheets: {},
  };

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      blankrows: false,
      defval: null,
    });

    if (!rawRows.length) {
      result.sheets[sheetName] = {
        name: sheetName,
        headers: [],
        rows: [],
      };
      continue;
    }

    const headers = (rawRows[0] || [])
      .map(normalizeHeader)
      .filter((h: string) => h.length > 0);

    const rows = rawRows.slice(1).map((row) => {
      const obj: Record<string, any> = {};
      headers.forEach((header, idx) => {
        obj[header] = row[idx] ?? null;
      });
      return obj;
    });

    result.sheets[sheetName] = {
      name: sheetName,
      headers,
      rows,
    };
  }

  return result;
}
