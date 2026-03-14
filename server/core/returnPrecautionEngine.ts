const RETURN_PRECAUTIONS: Record<string, string[]> = {
  // Respiratory
  pneumonia: [
    "Worsening shortness of breath or rapid breathing",
    "Persistent fever above 103°F despite medication",
    "Coughing up blood",
    "Chest pain that worsens with breathing",
    "Confusion or difficulty staying awake",
  ],
  bronchitis: [
    "Fever lasting more than 5 days or returning after improvement",
    "Shortness of breath or wheezing",
    "Symptoms not improving after 10 days",
    "Coughing up blood or large amounts of colored mucus",
  ],
  asthma: [
    "Rescue inhaler not providing relief",
    "Worsening shortness of breath at rest",
    "Unable to speak in full sentences",
    "Blue lips or fingertips",
    "Peak flow below 50% of personal best",
  ],
  copd_exacerbation: [
    "Inability to breathe comfortably despite medication",
    "Blue or purple lips or fingertips",
    "Confusion or drowsiness",
    "Worsening shortness of breath within 24 hours",
  ],

  // Cardiac
  acs: [
    "Return to ER immediately — this is a cardiac emergency",
    "Any return of chest pain, arm pain, or jaw pain",
    "Shortness of breath or excessive sweating",
    "Lightheadedness or loss of consciousness",
  ],
  heart_failure: [
    "Weight gain of more than 2–3 pounds overnight",
    "Worsening leg swelling",
    "Shortness of breath at rest or when lying flat",
    "Persistent cough with pink or foamy mucus",
  ],

  // GI
  appendicitis: [
    "Return to ER immediately — this is a surgical emergency",
    "Worsening right-sided abdominal pain",
    "Fever above 101°F",
    "Rigid or board-like abdomen",
  ],
  cholecystitis: [
    "Worsening right upper quadrant pain",
    "Fever or chills",
    "Yellowing of skin or eyes (jaundice)",
    "Unable to tolerate any fluids",
  ],
  gastroenteritis: [
    "Signs of dehydration: no urination in 8 hours, dry mouth, dizziness",
    "Blood in stool or vomit",
    "Fever above 103°F",
    "Symptoms not improving after 48–72 hours",
    "Unable to keep any fluids down",
  ],
  pancreatitis: [
    "Worsening severe abdominal pain",
    "Fever or chills",
    "Unable to tolerate any food or fluids",
    "Yellowing of skin or eyes",
  ],
  c_difficile: [
    "More than 10 watery stools per day",
    "Blood in stool",
    "High fever above 103°F",
    "Severe abdominal pain or cramping",
  ],

  // Neurological
  migraine: [
    "Worst headache of your life or sudden onset",
    "Fever or stiff neck with headache",
    "Vision changes, weakness, or speech problems",
    "Headache after head trauma",
    "Headache not responding to usual medications",
  ],
  tension_headache: [
    "Headache becomes the worst of your life",
    "Associated fever, stiff neck, or rash",
    "Neurological symptoms such as vision changes or weakness",
    "Headache persists more than 72 hours",
  ],
  stroke: [
    "Return to ER immediately — this is an emergency",
    "Any sudden weakness, numbness, or facial drooping",
    "Sudden vision or speech changes",
    "Sudden severe headache",
  ],

  // ENT
  strep_throat: [
    "Difficulty breathing or swallowing",
    "Drooling or inability to open mouth",
    "Fever not improving after 48 hours of antibiotics",
    "Swelling of the neck",
    "Rash developing after starting antibiotics",
  ],
  sinusitis: [
    "Severe headache or facial pain not responding to treatment",
    "Vision changes or swelling around the eyes",
    "Stiff neck or confusion",
    "Symptoms worsening after initial improvement",
  ],
  otitis_media: [
    "Fever above 103°F",
    "Ear pain not improving after 48–72 hours of antibiotics",
    "Fluid draining from ear",
    "Swelling or redness behind the ear",
    "Dizziness or hearing loss",
  ],
  otitis_externa: [
    "Pain or swelling spreading to jaw or neck",
    "Fever",
    "Hearing loss",
    "No improvement after 3 days of drops",
  ],

  // GU / GYN
  uti: [
    "Fever above 101°F — may indicate kidney infection",
    "Back or flank pain developing",
    "Symptoms not improving after 48 hours of antibiotics",
    "Shaking chills or vomiting",
  ],
  pyelonephritis: [
    "High fever above 103°F or shaking chills",
    "Unable to keep antibiotics or fluids down",
    "Worsening flank or back pain",
    "Confusion or extreme weakness",
  ],
  pid: [
    "Fever above 101°F",
    "Worsening pelvic pain",
    "Nausea or vomiting preventing medication use",
    "Signs of peritonitis: rigid abdomen",
  ],
  testicular_torsion: [
    "Return to ER immediately if pain returns after treatment",
    "Any worsening or recurrent pain in the testes",
  ],

  // MSK
  musculoskeletal_strain: [
    "Numbness, tingling, or weakness in arms or legs",
    "Loss of bladder or bowel control",
    "Pain not improving after 1 week of treatment",
    "Fever or unexplained weight loss with back pain",
  ],
  disc_herniation: [
    "New weakness or paralysis in legs",
    "Loss of bladder or bowel control — go to ER immediately",
    "Severe worsening pain not responding to medications",
  ],

  // Skin
  cellulitis: [
    "Red streaks spreading from the infected area",
    "Fever above 101°F",
    "Swelling or redness spreading rapidly",
    "Blistering, black areas, or severe pain",
  ],
  shingles: [
    "Rash spreading to face or near eyes",
    "Severe pain uncontrolled by medication",
    "Confusion, high fever, or weakness",
  ],
  urticaria: [
    "Throat tightening or difficulty swallowing",
    "Shortness of breath or wheezing",
    "Dizziness or lightheadedness",
    "Anaphylaxis — call 911 immediately",
  ],

  // Eye
  conjunctivitis: [
    "Significant pain in the eye",
    "Vision changes or vision loss",
    "Sensitivity to light",
    "No improvement after 48–72 hours of treatment",
  ],
  glaucoma_acute: [
    "Return to ER immediately — this is an eye emergency",
    "Any worsening of eye pain or vision",
  ],

  // Endocrine
  diabetes: [
    "Blood sugar above 400 mg/dL or below 60 mg/dL",
    "Fruity breath, nausea, or vomiting",
    "Rapid breathing or confusion",
    "Inability to take medications or fluids",
  ],
  hypoglycemia: [
    "Loss of consciousness or confusion",
    "Blood sugar not rising with treatment",
    "Repeated episodes in one day",
  ],

  // Infectious
  influenza: [
    "Difficulty breathing or shortness of breath",
    "Persistent chest pain",
    "Confusion, severe vomiting, or inability to stay awake",
    "Symptoms improving then returning with fever and cough",
  ],
  covid: [
    "Difficulty breathing or persistent chest pain",
    "Confusion or inability to stay awake",
    "Blue lips or face",
    "Persistent oxygen saturation below 94%",
  ],

  // Dental
  dental_abscess: [
    "Swelling spreading to cheek, jaw, or neck",
    "Difficulty swallowing or breathing",
    "High fever above 103°F",
    "Unable to open mouth",
  ],
};

export function generateReturnPrecautions(dx: string): string[] {
  return RETURN_PRECAUTIONS[dx] ?? [
    "Return if symptoms worsen significantly",
    "Return if new symptoms develop",
    "Return if fever above 103°F develops",
    "Return if you are unable to stay hydrated",
  ];
}

export function generateBulkReturnPrecautions(
  differentials: Array<{ diagnosis?: string; clusterId?: string }>
): Array<{ diagnosis: string; precautions: string[] }> {
  return differentials
    .map((d) => d.diagnosis ?? d.clusterId ?? "")
    .filter(Boolean)
    .slice(0, 3)
    .map((dx) => ({ diagnosis: dx, precautions: generateReturnPrecautions(dx) }));
}
