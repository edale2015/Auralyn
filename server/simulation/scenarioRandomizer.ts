function randomValue<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export interface ScenarioVariables {
  age: number;
  sex: string;
  duration: string;
  symptom1: string;
  symptom2: string;
  history: string;
  location: string;
  temperature: string;
}

export function generateScenarioVariables(): ScenarioVariables {
  return {
    age: randomInt(18, 95),
    sex: randomValue(["male", "female"]),
    duration: randomValue(["1", "2", "3", "5", "7", "10", "14"]),
    symptom1: randomValue([
      "fever", "shortness of breath", "nausea", "fatigue",
      "chills", "body aches", "night sweats", "malaise",
    ]),
    symptom2: randomValue([
      "vomiting", "dizziness", "sweating", "loss of appetite",
      "weakness", "confusion", "palpitations",
    ]),
    history: randomValue([
      "hypertension", "smoking", "diabetes", "COPD",
      "asthma", "coronary artery disease", "atrial fibrillation",
      "chronic kidney disease", "obesity",
    ]),
    location: randomValue(["left arm", "jaw", "back", "right shoulder", "neck", "epigastrium"]),
    temperature: randomValue(["100.4", "101.2", "102.0", "103.1", "104.0"]),
  };
}
