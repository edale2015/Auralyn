import { ENV } from "./env"

export type TranslationProvider = "deepl" | "google" | "mock"
export type EhrProvider = "ecw" | "epic" | "mock"

export function activeTranslationProvider(): TranslationProvider {
  if (ENV.DEEPL_API_KEY) return "deepl"
  if (ENV.GOOGLE_TRANSLATE_KEY) return "google"
  return "mock"
}

export function activeEhrProvider(): EhrProvider {
  if (ENV.EHR_ENDPOINT && ENV.EHR_API_KEY) return "ecw"
  return "mock"
}

export function translationProviderConfig() {
  return {
    provider: activeTranslationProvider(),
    hasDeepL: !!ENV.DEEPL_API_KEY,
    hasGoogle: !!ENV.GOOGLE_TRANSLATE_KEY,
    endpoint: ENV.EHR_ENDPOINT || null,
  }
}
