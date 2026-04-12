let weight = 1;

export function update(correct: boolean) {
  if (!correct) {
    weight += 0.01;
  }
  return weight;
}
