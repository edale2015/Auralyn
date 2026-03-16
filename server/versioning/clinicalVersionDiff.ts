import { getVersion } from "./clinicalVersionStore";
import { VersionDiff } from "./clinicalVersionTypes";

export function diffVersions(fromId: string, toId: string): VersionDiff | null {
  const v1 = getVersion(fromId);
  const v2 = getVersion(toId);

  if (!v1 || !v2) return null;

  const sheetsChanged = v1.sheetsHash !== v2.sheetsHash;
  const graphChanged = v1.graphHash !== v2.graphHash;

  const allSheets = new Set([...v1.sheetFiles, ...v2.sheetFiles]);
  const addedSheets = v2.sheetFiles.filter((f) => !v1.sheetFiles.includes(f));
  const removedSheets = v1.sheetFiles.filter((f) => !v2.sheetFiles.includes(f));

  const added = addedSheets.length + (v2.changeSummary?.added || 0);
  const removed = removedSheets.length + (v2.changeSummary?.removed || 0);
  const modified =
    (sheetsChanged ? 1 : 0) +
    (graphChanged ? 1 : 0) +
    (v2.changeSummary?.modified || 0);

  const affectedSheets = [
    ...new Set([
      ...addedSheets,
      ...removedSheets,
      ...(v2.changeSummary?.sheets || []),
      ...(v1.changeSummary?.sheets || []),
    ]),
  ];

  return {
    from: fromId,
    to: toId,
    added,
    removed,
    modified,
    affectedSheets: affectedSheets.length > 0 ? affectedSheets : [...allSheets],
    sheetsChanged,
    graphChanged,
    timestamp: Date.now(),
  };
}
