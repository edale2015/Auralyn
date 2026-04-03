/**
 * Multilingual intake translation pipeline.
 * 
 * Addresses Claude Q25: NYC market requires English, Spanish, Mandarin/Cantonese,
 * Bengali, Russian, Arabic, Haitian Creole, and Korean at minimum.
 * 
 * Architecture: detect language → translate to English → run clinical pipeline
 * in English → translate output back to detected language.
 */

export const NYC_REQUIRED_LANGUAGES = new Set([
  "en", // English
  "es", // Spanish
  "zh", // Mandarin/Cantonese
  "bn", // Bengali
  "ru", // Russian
  "ar", // Arabic
  "ht", // Haitian Creole
  "ko", // Korean
]);

export const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  zh: "Chinese (Mandarin/Cantonese)",
  bn: "Bengali",
  ru: "Russian",
  ar: "Arabic",
  ht: "Haitian Creole",
  ko: "Korean",
};

export interface TranslationProvider {
  detectLanguage(text: string): Promise<string>;
  translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<string>;
}

export interface NormalizedInbound {
  detectedLanguage: string;
  isNycSupportedLanguage: boolean;
  normalizedEnglishText: string;
  originalText: string;
}

export async function normalizeInboundText(
  provider: TranslationProvider,
  rawText: string
): Promise<NormalizedInbound> {
  let detectedLanguage: string;
  try {
    detectedLanguage = await provider.detectLanguage(rawText);
  } catch (e: any) {
    console.warn("[MultilingualIntake] Language detection failed, defaulting to en:", e?.message);
    detectedLanguage = "en";
  }

  const isNycSupportedLanguage = NYC_REQUIRED_LANGUAGES.has(detectedLanguage);

  if (detectedLanguage === "en") {
    return {
      detectedLanguage: "en",
      isNycSupportedLanguage: true,
      normalizedEnglishText: rawText,
      originalText: rawText,
    };
  }

  let normalizedEnglishText: string;
  try {
    normalizedEnglishText = await provider.translate(rawText, detectedLanguage, "en");
  } catch (e: any) {
    console.error("[MultilingualIntake] Translation to English failed:", e?.message);
    normalizedEnglishText = rawText;
  }

  return {
    detectedLanguage,
    isNycSupportedLanguage,
    normalizedEnglishText,
    originalText: rawText,
  };
}

export async function localizeOutboundText(
  provider: TranslationProvider,
  englishText: string,
  targetLanguage: string
): Promise<string> {
  if (!targetLanguage || targetLanguage === "en") return englishText;

  try {
    return await provider.translate(englishText, "en", targetLanguage);
  } catch (e: any) {
    console.error(
      `[MultilingualIntake] Translation to ${targetLanguage} failed:`,
      e?.message
    );
    return englishText;
  }
}

/**
 * Google Cloud Translation API provider adapter.
 * Requires GOOGLE_TRANSLATE_API_KEY or GCP credentials.
 * GCP Translation API has a HIPAA BAA available under GCP addendum.
 */
export function createGoogleTranslationProvider(apiKey: string): TranslationProvider {
  return {
    async detectLanguage(text: string): Promise<string> {
      const url = `https://translation.googleapis.com/language/translate/v2/detect?key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text }),
      });
      if (!resp.ok) throw new Error(`Language detection HTTP ${resp.status}`);
      const data = await resp.json() as any;
      return data?.data?.detections?.[0]?.[0]?.language ?? "en";
    },

    async translate(text: string, source: string, target: string): Promise<string> {
      const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text, source, target, format: "text" }),
      });
      if (!resp.ok) throw new Error(`Translation HTTP ${resp.status}`);
      const data = await resp.json() as any;
      return data?.data?.translations?.[0]?.translatedText ?? text;
    },
  };
}

let _provider: TranslationProvider | null = null;

export function initTranslationProvider(): void {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (apiKey) {
    _provider = createGoogleTranslationProvider(apiKey);
    console.log("[MultilingualIntake] Google Translate provider initialized");
  } else {
    console.warn(
      "[MultilingualIntake] GOOGLE_TRANSLATE_API_KEY not set — multilingual intake disabled. " +
      "Set this key and ensure GCP HIPAA addendum is active."
    );
  }
}

export function getTranslationProvider(): TranslationProvider | null {
  return _provider;
}
