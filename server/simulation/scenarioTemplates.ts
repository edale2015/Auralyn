export const scenarioTemplates: Record<string, string[]> = {
  cough: [
    "A {age}-year-old {sex} presents with {duration} days of cough and {symptom1}.",
    "Patient reports cough beginning {duration} days ago with associated {symptom1} and {symptom2}.",
    "A {age}-year-old {sex} with history of {history} reports persistent cough and {symptom1}.",
    "A {age}-year-old {sex} presents with a {duration}-day productive cough, {symptom1}, and reports {symptom2}.",
    "Patient is a {age}-year-old {sex} with {duration} days of dry cough. Reports associated {symptom1} but denies {symptom2}.",
  ],

  chest_pain: [
    "A {age}-year-old {sex} presents with sudden chest pain radiating to the {location}.",
    "Patient reports crushing chest pain beginning {duration} minutes ago with {symptom1}.",
    "A {age}-year-old {sex} with history of {history} presents with severe chest pain and {symptom1}.",
    "A {age}-year-old {sex} describes substernal pressure for {duration} minutes with {symptom1} and {symptom2}.",
    "Patient is a {age}-year-old {sex} with acute chest discomfort radiating to the {location}, associated with {symptom1}.",
  ],

  headache: [
    "A {age}-year-old {sex} presents with severe headache and {symptom1}.",
    "Patient reports the worst headache of their life beginning {duration} hours ago.",
    "A {age}-year-old {sex} with no prior headache history reports sudden onset head pain and {symptom1}.",
    "A {age}-year-old {sex} presents with thunderclap headache, {symptom1}, and neck stiffness.",
    "Patient is a {age}-year-old {sex} with a {duration}-hour history of progressively worsening headache and {symptom2}.",
  ],

  dizziness: [
    "A {age}-year-old {sex} presents with {duration} days of episodic dizziness and {symptom1}.",
    "Patient reports room-spinning vertigo beginning {duration} days ago, worsened by position changes.",
    "A {age}-year-old {sex} with history of {history} presents with dizziness and {symptom2}.",
    "A {age}-year-old {sex} describes {duration} days of lightheadedness with {symptom1} and unsteady gait.",
  ],

  sore_throat: [
    "A {age}-year-old {sex} presents with {duration} days of sore throat and {symptom1}.",
    "Patient reports difficulty swallowing for {duration} days with associated {symptom1}.",
    "A {age}-year-old {sex} presents with severe pharyngitis, {symptom1}, and {symptom2}.",
    "Patient is a {age}-year-old {sex} with {duration} days of progressive sore throat and muffled voice.",
  ],

  fever: [
    "A {age}-year-old {sex} presents with {duration} days of fever reaching {temperature}°F and {symptom1}.",
    "Patient reports high fever for {duration} days with {symptom1} and {symptom2}.",
    "A {age}-year-old {sex} with history of {history} presents with persistent fever and {symptom1}.",
    "A {age}-year-old {sex} presents with {duration}-day fever, rigors, and {symptom1}.",
  ],

  ear_pain: [
    "A {age}-year-old {sex} presents with {duration} days of ear pain and {symptom1}.",
    "Patient reports unilateral ear pain for {duration} days with associated hearing changes.",
    "A {age}-year-old {sex} presents with otalgia, {symptom1}, and ear discharge for {duration} days.",
  ],

  breathlessness: [
    "A {age}-year-old {sex} presents with acute shortness of breath and {symptom1}.",
    "Patient reports progressive dyspnea over {duration} days with {symptom1} and {symptom2}.",
    "A {age}-year-old {sex} with history of {history} presents with worsening breathlessness.",
    "A {age}-year-old {sex} presents with {duration}-day exertional dyspnea and orthopnea.",
  ],
};
