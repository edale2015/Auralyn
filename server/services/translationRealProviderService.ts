import { translate } from "./translationAdapter"
import { ENV } from "../config/env"

export type BatchTranslationRequest = {
  texts: string[]
  targetLang: string
  sourceLang?: string
}

export type BatchTranslationResult = {
  provider: string
  results: { original: string; translated: string; targetLang: string }[]
  totalMs: number
}

export async function batchTranslate(req: BatchTranslationRequest): Promise<BatchTranslationResult> {
  const t0 = Date.now()
  const results = await Promise.all(
    req.texts.map(async (text) => {
      const r = await translate(text, req.targetLang, req.sourceLang)
      return { original: text, translated: r.targetText, targetLang: req.targetLang }
    })
  )
  return {
    provider: ENV.DEEPL_API_KEY ? "deepl" : ENV.GOOGLE_TRANSLATE_KEY ? "google" : "mock",
    results,
    totalMs: Date.now() - t0,
  }
}

export async function detectLanguage(text: string): Promise<{ lang: string; confidence: number }> {
  const ascii = text.split("").filter((c) => c.charCodeAt(0) < 128).length
  const ratio = ascii / Math.max(text.length, 1)
  return { lang: ratio > 0.8 ? "en" : "unknown", confidence: ratio > 0.8 ? 0.85 : 0.4 }
}
