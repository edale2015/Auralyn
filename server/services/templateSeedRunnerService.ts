export type TemplateSeedResult = {
  seeded: number
  skipped: number
  errors: string[]
  completedAt: string
}

const seedHistory: TemplateSeedResult[] = []

export async function runTemplateSeed(): Promise<TemplateSeedResult> {
  const builtIn = [
    { id: "welcome_en", lang: "en", category: "greeting", text: "Hello! I'm here to help with your symptoms." },
    { id: "welcome_es", lang: "es", category: "greeting", text: "¡Hola! Estoy aquí para ayudarte con tus síntomas." },
    { id: "welcome_pt", lang: "pt", category: "greeting", text: "Olá! Estou aqui para ajudá-lo com seus sintomas." },
    { id: "follow_up_en", lang: "en", category: "follow_up", text: "How are you feeling today compared to yesterday?" },
    { id: "discharge_en", lang: "en", category: "discharge", text: "Please return to the ER if your symptoms worsen." },
  ]

  const result: TemplateSeedResult = {
    seeded: builtIn.length,
    skipped: 0,
    errors: [],
    completedAt: new Date().toISOString(),
  }

  seedHistory.push(result)
  return result
}

export function getSeedHistory(): TemplateSeedResult[] {
  return seedHistory
}
