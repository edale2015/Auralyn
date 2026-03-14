import { activeTranslationProvider } from "../config/providerKeys"

export type TranslationResult = {
  provider: string
  sourceText: string
  targetText: string
  sourceLang: string
  targetLang: string
  confidence: number
}

export async function translate(
  text: string,
  targetLang: string,
  sourceLang = "en"
): Promise<TranslationResult> {
  const provider = activeTranslationProvider()

  if (provider === "deepl") {
    return translateWithDeepL(text, targetLang, sourceLang)
  }
  if (provider === "google") {
    return translateWithGoogle(text, targetLang, sourceLang)
  }
  return translateMock(text, targetLang, sourceLang)
}

async function translateWithDeepL(text: string, targetLang: string, sourceLang: string): Promise<TranslationResult> {
  return { provider: "deepl", sourceText: text, targetText: `[DeepL:${targetLang}] ${text}`, sourceLang, targetLang, confidence: 0.97 }
}

async function translateWithGoogle(text: string, targetLang: string, sourceLang: string): Promise<TranslationResult> {
  return { provider: "google", sourceText: text, targetText: `[Google:${targetLang}] ${text}`, sourceLang, targetLang, confidence: 0.94 }
}

function translateMock(text: string, targetLang: string, sourceLang: string): TranslationResult {
  return { provider: "mock", sourceText: text, targetText: `[${targetLang}] ${text}`, sourceLang, targetLang, confidence: 0.5 }
}
