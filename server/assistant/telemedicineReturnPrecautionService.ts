export interface ReturnPrecautionSet {
  complaint: string;
  disposition: string;
  immediateReturn: string[];
  warningSymptoms: string[];
  expectedCourse: string;
  followupRecommendation: string;
  additionalInstructions: string[];
  dischargeMessage: string;
}

const RETURN_PRECAUTIONS: Record<string, Record<string, ReturnPrecautionSet>> = {
  sore_throat: {
    Prescription: {
      complaint: "sore_throat", disposition: "Prescription",
      immediateReturn: ["Difficulty breathing or stridor", "Drooling / unable to swallow saliva", "Muffled or 'hot potato' voice", "Uvular deviation", "Fever not responding to antibiotics after 72h"],
      warningSymptoms: ["Worsening throat pain after 48h of antibiotics", "Rash (may indicate mononucleosis or allergic reaction)", "Swollen lymph nodes enlarging"],
      expectedCourse: "Fever should improve within 24–48h of starting antibiotics. Throat pain should improve by day 3. Full course of 10 days must be completed.",
      followupRecommendation: "Return in 10 days if symptoms persist or sooner if worsening.",
      additionalInstructions: ["Take all antibiotics — complete the full course", "Stay hydrated", "Salt water gargles (1/2 tsp in 8oz warm water)", "Avoid sharing utensils"],
      dischargeMessage: "You have been prescribed antibiotics for a strep throat infection. Take all doses as directed. Return immediately if you develop difficulty breathing, drooling, or a hot potato voice. Throat pain should improve by day 3.",
    },
    "Home Care": {
      complaint: "sore_throat", disposition: "Home Care",
      immediateReturn: ["Difficulty breathing or stridor", "Unable to swallow fluids", "Drooling"],
      warningSymptoms: ["Fever developing or worsening after 3 days", "Throat pain significantly worsening"],
      expectedCourse: "Viral sore throat typically resolves in 5–7 days without antibiotics.",
      followupRecommendation: "Return if not improving by day 7 or if fever develops.",
      additionalInstructions: ["Rest and hydration", "Warm salt water gargles", "Ibuprofen or acetaminophen for pain and fever", "Throat lozenges for comfort"],
      dischargeMessage: "Your sore throat is most likely viral and does not require antibiotics. Rest, drink plenty of fluids, and use over-the-counter pain relievers. Return if you develop difficulty breathing or the throat pain becomes severe.",
    },
  },
  cough: {
    "Home Care": {
      complaint: "cough", disposition: "Home Care",
      immediateReturn: ["Coughing up blood", "Sudden severe shortness of breath", "Chest pain", "High fever > 103°F for more than 3 days", "Rapid breathing or difficulty breathing at rest"],
      warningSymptoms: ["Cough lasting more than 3 weeks", "Night sweats with weight loss", "Worsening despite 5–7 days of treatment"],
      expectedCourse: "Most viral coughs resolve in 1–3 weeks. Some post-viral coughs may last up to 8 weeks.",
      followupRecommendation: "Return if cough lasts more than 3 weeks or worsens significantly.",
      additionalInstructions: ["Rest and increase fluids", "Honey 1–2 tsp helps suppress cough", "Humidifier in bedroom", "Avoid smoke exposure"],
      dischargeMessage: "Your cough appears to be from a viral infection. Rest, stay hydrated, and use honey or over-the-counter cough medication. See a doctor immediately if you cough up blood, have severe shortness of breath, or chest pain.",
    },
    "Urgent Care": {
      complaint: "cough", disposition: "Urgent Care",
      immediateReturn: ["Worsening shortness of breath", "Oxygen saturation dropping", "Coughing up blood", "Inability to keep fluids down"],
      warningSymptoms: ["Fever not improving after 48h of antibiotics", "Increasing fatigue or confusion"],
      expectedCourse: "Pneumonia typically requires 5–7 days of antibiotics and 2–4 weeks for full recovery.",
      followupRecommendation: "Follow up within 48–72h to assess treatment response. Repeat chest X-ray in 4–6 weeks.",
      additionalInstructions: ["Complete full antibiotic course", "Rest — activity restriction during febrile phase", "Adequate hydration"],
      dischargeMessage: "You have been treated for a respiratory infection possibly including pneumonia. Take all antibiotics as prescribed and rest. Return immediately if you develop worsening shortness of breath or chest pain.",
    },
  },
  uti: {
    Prescription: {
      complaint: "uti", disposition: "Prescription",
      immediateReturn: ["Fever develops or temperature > 100.4°F", "Flank or back pain", "Nausea or vomiting preventing medication intake", "Symptoms not improving within 48h"],
      warningSymptoms: ["Blood in urine worsening", "Increasing pain"],
      expectedCourse: "Symptoms should improve within 24–48h. Complete the full 3–5 day course.",
      followupRecommendation: "Return if not improving in 48h. Test of cure urine culture recommended for recurrent UTI.",
      additionalInstructions: ["Take all antibiotic doses — even if feeling better", "Drink 8–10 glasses of water daily", "Avoid caffeine and alcohol", "Void frequently — do not hold urine"],
      dischargeMessage: "You have a urinary tract infection (UTI) and have been prescribed antibiotics. Take all doses. Drink plenty of water. Return immediately if you develop fever, back/flank pain, or if symptoms are not improving after 48 hours.",
    },
  },
  fever: {
    "Home Care": {
      complaint: "fever", disposition: "Home Care",
      immediateReturn: ["Fever > 104°F", "Stiff neck or light sensitivity (photophobia)", "Rash (especially non-blanching or petechial)", "Confusion or altered mental status", "Difficulty breathing"],
      warningSymptoms: ["Fever lasting more than 5 days", "No obvious source found", "Immunocompromised patient"],
      expectedCourse: "Most viral fevers resolve in 3–5 days.",
      followupRecommendation: "Return if fever persists beyond 5 days or worsens.",
      additionalInstructions: ["Acetaminophen or ibuprofen alternating for fever control", "Push fluids — water, electrolyte drinks", "Monitor temperature q4h", "Wear light clothing"],
      dischargeMessage: "Your fever appears to be from a viral infection. Use acetaminophen and ibuprofen alternating as directed, and stay well hydrated. Return IMMEDIATELY if you develop stiff neck, rash, confusion, or temperature above 104°F.",
    },
  },
  chest_pain: {
    ED: {
      complaint: "chest_pain", disposition: "ED",
      immediateReturn: ["Call 911 immediately if symptoms worsen", "Increasing chest pressure", "Shortness of breath", "Lightheadedness or syncope", "Arm, jaw, or back pain"],
      warningSymptoms: ["Recurrence of same pain", "Palpitations"],
      expectedCourse: "Emergency evaluation required. Results will determine next steps.",
      followupRecommendation: "Cardiology or primary care follow-up as directed by ER.",
      additionalInstructions: ["Do not drive yourself to the ER if currently symptomatic", "Chew aspirin 325mg if instructed and no allergy"],
      dischargeMessage: "Your symptoms require emergency evaluation. Please go to the ER immediately or call 911. Do not delay. If aspirin was recommended and you have no allergy, chew one regular aspirin (325mg) now.",
    },
  },
  rash: {
    "Urgent Care": {
      complaint: "rash", disposition: "Urgent Care",
      immediateReturn: ["Throat swelling or difficulty breathing", "Rapidly spreading rash within hours", "Fever with non-blanching (press and it stays red) spots", "Severe facial swelling"],
      warningSymptoms: ["Rash spreading despite treatment", "New blisters or skin breakdown"],
      expectedCourse: "Allergic rashes typically improve within 3–7 days with antihistamine treatment.",
      followupRecommendation: "Dermatology follow-up if not improving in 2 weeks.",
      additionalInstructions: ["Identify and avoid the trigger (new product, food, or contact)", "Cool compress for itching", "Avoid scratching", "Use antihistamine as directed"],
      dischargeMessage: "You have a skin rash that has been evaluated. Take the recommended antihistamine, avoid scratching, and identify any triggers. Seek immediate care if your throat swells or you have difficulty breathing.",
    },
  },
  ear_pain: {
    Prescription: {
      complaint: "ear_pain", disposition: "Prescription",
      immediateReturn: ["Swelling behind the ear (mastoiditis)", "Facial drooping on same side", "High fever not responding to antibiotics after 72h", "Severe dizziness or hearing loss suddenly worsening"],
      warningSymptoms: ["Ear pain not improving after 48h of antibiotics", "Ear discharge"],
      expectedCourse: "Ear pain should improve within 48–72h of antibiotics. Full course required.",
      followupRecommendation: "Follow-up in 10–14 days to confirm resolution.",
      additionalInstructions: ["Complete full antibiotic course", "Do not use cotton swabs in ear", "Keep ear dry during treatment"],
      dischargeMessage: "You have an ear infection and have been prescribed antibiotics. Pain should improve within 48–72 hours. Take all medication as directed. Return immediately if you develop swelling behind the ear or facial drooping.",
    },
  },
  sinus_pressure: {
    "Home Care": {
      complaint: "sinus_pressure", disposition: "Home Care",
      immediateReturn: ["Severe headache (worst of life)", "Swelling around eyes or forehead", "Double vision or vision changes", "High fever with stiff neck"],
      warningSymptoms: ["Symptoms not improving after 7–10 days", "Yellow/green discharge for > 10 days", "Significant worsening after initial improvement"],
      expectedCourse: "Viral sinusitis typically resolves in 7–10 days.",
      followupRecommendation: "Return if symptoms persist beyond 10 days or significantly worsen.",
      additionalInstructions: ["Saline nasal irrigation twice daily", "Nasal decongestant spray max 3 days only", "Warm face cloth compress for facial pain", "Stay hydrated"],
      dischargeMessage: "Your sinus pressure is most likely from a viral infection. Use saline rinses, decongestants for no more than 3 days, and take pain relievers as needed. Return if symptoms last more than 10 days or you develop vision changes or severe headache.",
    },
  },
  abdominal_pain: {
    ED: {
      complaint: "abdominal_pain", disposition: "ED",
      immediateReturn: ["This IS an emergency — go to ER now", "Worsening or sudden severe pain", "Rigid board-like abdomen", "High fever", "Fainting"],
      warningSymptoms: ["Any worsening before ER arrival"],
      expectedCourse: "Evaluation in progress — treatment depends on diagnosis.",
      followupRecommendation: "Follow all ER discharge instructions.",
      additionalInstructions: ["Nothing to eat or drink (NPO) until evaluated", "Do not take pain medications before evaluation without ER guidance"],
      dischargeMessage: "Your abdominal pain requires urgent evaluation in an emergency department. Please go now. Do not eat or drink anything until you are seen.",
    },
    "Home Care": {
      complaint: "abdominal_pain", disposition: "Home Care",
      immediateReturn: ["Sudden severe worsening of pain", "Rigidity of abdomen", "High fever developing", "Inability to keep any fluids down > 12h", "Blood in stool"],
      warningSymptoms: ["Pain not improving within 24–48h", "Worsening nausea/vomiting"],
      expectedCourse: "Viral gastroenteritis typically resolves in 1–3 days.",
      followupRecommendation: "Follow up with primary care in 1 week if still symptomatic.",
      additionalInstructions: ["Clear liquids initially — advance slowly to bland diet (BRAT)", "Oral rehydration solution if vomiting", "Avoid fatty and spicy foods"],
      dischargeMessage: "Your abdominal pain is most likely from a stomach virus. Rest, stay on clear liquids initially, and advance your diet slowly. Return immediately if the pain becomes severe, you develop a fever, or you cannot keep fluids down.",
    },
  },
};

const DEFAULT_RETURN_PRECAUTIONS: ReturnPrecautionSet = {
  complaint: "general", disposition: "general",
  immediateReturn: ["Worsening symptoms", "High fever > 103°F", "Difficulty breathing", "Severe pain", "Confusion or altered mental status"],
  warningSymptoms: ["Symptoms not improving in 48–72h", "New symptoms developing"],
  expectedCourse: "Most acute conditions improve within 3–7 days with appropriate treatment.",
  followupRecommendation: "Return for re-evaluation if not improving as expected.",
  additionalInstructions: ["Rest", "Stay hydrated", "Take all prescribed medications as directed"],
  dischargeMessage: "Please follow all instructions given during your visit. Return immediately if your symptoms significantly worsen or you develop difficulty breathing, high fever, or severe pain.",
};

export function getReturnPrecautions(complaint: string, disposition: string): ReturnPrecautionSet {
  return (RETURN_PRECAUTIONS[complaint]?.[disposition]) ?? DEFAULT_RETURN_PRECAUTIONS;
}

export function formatDischargeMessage(precautions: ReturnPrecautionSet, patientName?: string): string {
  const greeting = patientName ? `Hello ${patientName},\n\n` : "Hello,\n\n";
  const immediate = precautions.immediateReturn.map(r => `• ${r}`).join("\n");
  const additional = precautions.additionalInstructions.map(i => `• ${i}`).join("\n");
  return `${greeting}${precautions.dischargeMessage}\n\n**RETURN IMMEDIATELY IF:**\n${immediate}\n\n**ADDITIONAL INSTRUCTIONS:**\n${additional}\n\n**EXPECTED COURSE:** ${precautions.expectedCourse}\n\n**FOLLOW-UP:** ${precautions.followupRecommendation}`;
}
