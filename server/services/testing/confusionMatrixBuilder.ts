export interface ConfusionMatrix {
  labels: string[];
  matrix: number[][];
  accuracy: number;
  precision: Record<string, number>;
  recall: Record<string, number>;
}

export function buildConfusionMatrix(
  predicted: string[],
  actual: string[]
): ConfusionMatrix {
  const labelSet = new Set([...predicted, ...actual]);
  const labels = Array.from(labelSet).sort();
  const labelIndex = new Map(labels.map((l, i) => [l, i]));
  const n = labels.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < predicted.length; i++) {
    const pIdx = labelIndex.get(predicted[i]);
    const aIdx = labelIndex.get(actual[i]);
    if (pIdx !== undefined && aIdx !== undefined) matrix[aIdx][pIdx]++;
  }

  let correct = 0;
  for (let i = 0; i < n; i++) correct += matrix[i][i];
  const accuracy = predicted.length > 0 ? correct / predicted.length : 0;

  const precision: Record<string, number> = {};
  const recall: Record<string, number> = {};

  for (let i = 0; i < n; i++) {
    const colSum = matrix.reduce((s, row) => s + row[i], 0);
    const rowSum = matrix[i].reduce((s, v) => s + v, 0);
    precision[labels[i]] = colSum > 0 ? matrix[i][i] / colSum : 0;
    recall[labels[i]] = rowSum > 0 ? matrix[i][i] / rowSum : 0;
  }

  return { labels, matrix, accuracy, precision, recall };
}
