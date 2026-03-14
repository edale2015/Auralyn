import { translationProviderConfig, type TranslationProvider } from "../config/providerKeys"

export type ProviderConfig = {
  provider: TranslationProvider
  hasDeepL: boolean
  hasGoogle: boolean
  endpoint: string | null
  supportedLangs: string[]
}

const SUPPORTED_LANGS = ["en", "es", "pt", "fr", "ar", "zh", "hi", "ru", "de", "it", "ja", "ko"]

export function getTranslationProviderConfig(): ProviderConfig {
  const base = translationProviderConfig()
  return { ...base, supportedLangs: SUPPORTED_LANGS }
}

export function updateTranslationProvider(_provider: TranslationProvider): { ok: boolean; message: string } {
  return { ok: true, message: "Provider config is read from environment variables. Set DEEPL_API_KEY or GOOGLE_TRANSLATE_KEY to switch providers." }
}
