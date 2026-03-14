import { listTemplates } from "./multilingualTemplateCrudService"
import { batchTranslate } from "./translationRealProviderService"

export type LibraryEntry = {
  key: string
  category: string
  translations: Record<string, string>
}

export function buildTemplateLibrary(): LibraryEntry[] {
  const templates = listTemplates()
  const grouped: Record<string, LibraryEntry> = {}

  for (const t of templates) {
    const groupKey = `${t.key}__${t.category}`
    if (!grouped[groupKey]) {
      grouped[groupKey] = { key: t.key, category: t.category, translations: {} }
    }
    grouped[groupKey].translations[t.lang] = t.text
  }

  return Object.values(grouped)
}

export async function autoTranslateTemplate(
  key: string,
  category: string,
  sourceText: string,
  targetLangs: string[]
): Promise<LibraryEntry> {
  const results = await batchTranslate({ texts: [sourceText], targetLang: targetLangs[0] })
  const translations: Record<string, string> = { en: sourceText }
  for (const lang of targetLangs) {
    const r = await batchTranslate({ texts: [sourceText], targetLang: lang })
    translations[lang] = r.results[0]?.translated ?? sourceText
  }
  return { key, category, translations }
}

export function getTemplatesByLanguage(lang: string): { key: string; category: string; text: string }[] {
  return listTemplates(lang).map((t) => ({ key: t.key, category: t.category, text: t.text }))
}
