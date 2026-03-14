export type MultilingualTemplate = {
  id: string
  key: string
  category: string
  lang: string
  text: string
  variables: string[]
  createdAt: string
  updatedAt: string
  createdBy: string
}

const store: MultilingualTemplate[] = [
  { id: "mt_1", key: "greeting", category: "onboarding", lang: "en", text: "Hello! I'm here to help with your symptoms.", variables: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: "system" },
  { id: "mt_2", key: "greeting", category: "onboarding", lang: "es", text: "¡Hola! Estoy aquí para ayudarte.", variables: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: "system" },
  { id: "mt_3", key: "greeting", category: "onboarding", lang: "pt", text: "Olá! Estou aqui para ajudá-lo.", variables: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: "system" },
  { id: "mt_4", key: "discharge_instructions", category: "discharge", lang: "en", text: "Please follow up with your doctor if symptoms worsen.", variables: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: "system" },
  { id: "mt_5", key: "discharge_instructions", category: "discharge", lang: "es", text: "Consulte a su médico si los síntomas empeoran.", variables: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: "system" },
]

function nextId() { return `mt_${Date.now()}` }

export function listTemplates(lang?: string, category?: string): MultilingualTemplate[] {
  return store.filter((t) => (!lang || t.lang === lang) && (!category || t.category === category))
}

export function getTemplate(id: string): MultilingualTemplate | undefined {
  return store.find((t) => t.id === id)
}

export function createTemplate(data: Omit<MultilingualTemplate, "id" | "createdAt" | "updatedAt">): MultilingualTemplate {
  const t: MultilingualTemplate = {
    ...data,
    id: nextId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  store.push(t)
  return t
}

export function updateTemplate(id: string, patch: Partial<Pick<MultilingualTemplate, "text" | "variables" | "category">>): MultilingualTemplate | null {
  const t = store.find((x) => x.id === id)
  if (!t) return null
  Object.assign(t, patch, { updatedAt: new Date().toISOString() })
  return t
}

export function deleteTemplate(id: string): boolean {
  const idx = store.findIndex((t) => t.id === id)
  if (idx === -1) return false
  store.splice(idx, 1)
  return true
}

export function getAvailableLangs(): string[] {
  return [...new Set(store.map((t) => t.lang))]
}

export function getAvailableCategories(): string[] {
  return [...new Set(store.map((t) => t.category))]
}
