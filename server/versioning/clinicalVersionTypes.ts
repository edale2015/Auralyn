export interface ClinicalVersion {
  id: string;
  createdAt: number;
  createdBy: string;
  description?: string;
  sheetsHash: string;
  graphHash: string;
  sheetFiles: string[];
  changeSummary?: {
    added: number;
    removed: number;
    modified: number;
    sheets: string[];
    details?: string;
  };
  status: "draft" | "reviewed" | "deployed" | "rolled_back";
}

export interface VersionDiff {
  from: string;
  to: string;
  added: number;
  removed: number;
  modified: number;
  affectedSheets: string[];
  sheetsChanged: boolean;
  graphChanged: boolean;
  timestamp: number;
}

export interface VersionTimelineEntry {
  version: string;
  time: number;
  description: string;
  status: string;
  createdBy: string;
}
