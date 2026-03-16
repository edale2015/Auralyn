export interface DiffResult {
  added: Record<string, any>[];
  removed: Record<string, any>[];
  modified: { old: Record<string, any>; new: Record<string, any> }[];
  unchanged: number;
}

export function diffSheets(
  oldRows: Record<string, any>[],
  newRows: Record<string, any>[],
  keyColumn?: string
): DiffResult {
  if (keyColumn) {
    return diffByKey(oldRows, newRows, keyColumn);
  }
  return diffByHash(oldRows, newRows);
}

function diffByKey(
  oldRows: Record<string, any>[],
  newRows: Record<string, any>[],
  keyColumn: string
): DiffResult {
  const oldMap = new Map<string, Record<string, any>>();
  oldRows.forEach((r) => {
    const key = String(r[keyColumn] ?? "").trim();
    if (key) oldMap.set(key, r);
  });

  const result: DiffResult = { added: [], removed: [], modified: [], unchanged: 0 };
  const seenKeys = new Set<string>();

  newRows.forEach((r) => {
    const key = String(r[keyColumn] ?? "").trim();
    if (!key) return;
    seenKeys.add(key);

    const old = oldMap.get(key);
    if (!old) {
      result.added.push(r);
    } else if (JSON.stringify(old) !== JSON.stringify(r)) {
      result.modified.push({ old, new: r });
    } else {
      result.unchanged++;
    }
  });

  oldMap.forEach((r, key) => {
    if (!seenKeys.has(key)) {
      result.removed.push(r);
    }
  });

  return result;
}

function diffByHash(
  oldRows: Record<string, any>[],
  newRows: Record<string, any>[]
): DiffResult {
  const oldSet = new Set(oldRows.map((r) => JSON.stringify(r)));
  const newSet = new Set(newRows.map((r) => JSON.stringify(r)));

  const result: DiffResult = { added: [], removed: [], modified: [], unchanged: 0 };

  newRows.forEach((r) => {
    const key = JSON.stringify(r);
    if (oldSet.has(key)) {
      result.unchanged++;
    } else {
      result.added.push(r);
    }
  });

  oldRows.forEach((r) => {
    const key = JSON.stringify(r);
    if (!newSet.has(key)) {
      result.removed.push(r);
    }
  });

  return result;
}
