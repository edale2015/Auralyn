export function predict(patient: any) {
  const hr   = patient.vitals.hr;
  const spo2 = patient.vitals.spo2;

  if (hr > 110 && spo2 < 94) {
    return { risk: "high", message: "Possible sepsis" };
  }

  return { risk: "low" };
}
