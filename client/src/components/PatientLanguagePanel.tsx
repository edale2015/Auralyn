import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const LANG_LABELS: Record<string, string> = {
  en: "English", es: "Español", pt: "Português", fr: "Français",
  ar: "العربية", zh: "中文", hi: "हिन्दी", ru: "Русский",
  de: "Deutsch", it: "Italiano", ja: "日本語", ko: "한국어",
}

export default function PatientLanguagePanel({
  onTranslate,
}: {
  onTranslate?: (lang: string, translations: Record<string, string>) => void
}) {
  const [selectedLang, setSelectedLang] = useState("es")
  const [sourceText, setSourceText] = useState("")
  const [translating, setTranslating] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const { data: configData } = useQuery({
    queryKey: ["/api/translation-provider/config"],
    queryFn: () => fetch("/api/translation-provider/config").then((r) => r.json()),
  })

  const supportedLangs: string[] = configData?.config?.supportedLangs ?? ["en", "es", "pt"]

  async function handleTranslate() {
    if (!sourceText.trim()) return
    setTranslating(true)
    try {
      const res = await fetch("/api/translation-provider/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: [sourceText], targetLang: selectedLang }),
      })
      const data = await res.json()
      const translated = data.results?.[0]?.translated ?? sourceText
      setResult(translated)
      onTranslate?.(selectedLang, { [selectedLang]: translated, en: sourceText })
    } finally {
      setTranslating(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {supportedLangs.filter((l) => l !== "en").map((lang) => (
          <button
            key={lang}
            data-testid={`lang-btn-${lang}`}
            onClick={() => { setSelectedLang(lang); setResult(null) }}
            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
              selectedLang === lang
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-background hover:bg-muted"
            }`}
          >
            {LANG_LABELS[lang] ?? lang}
          </button>
        ))}
      </div>
      <textarea
        className="w-full text-sm border rounded-lg p-2 resize-none"
        rows={3}
        placeholder="Enter text to translate…"
        value={sourceText}
        onChange={(e) => setSourceText(e.target.value)}
      />
      <Button size="sm" onClick={handleTranslate} disabled={translating || !sourceText.trim()}>
        {translating ? "Translating…" : `Translate to ${LANG_LABELS[selectedLang] ?? selectedLang}`}
      </Button>
      {configData?.config && (
        <p className="text-[10px] text-muted-foreground">
          Provider: <Badge variant="outline" className="text-[10px]">{configData.config.provider}</Badge>
        </p>
      )}
      {result && (
        <div className="border rounded-lg p-3 bg-muted text-sm">
          <p className="font-medium text-xs text-muted-foreground mb-1">{LANG_LABELS[selectedLang] ?? selectedLang}</p>
          <p>{result}</p>
        </div>
      )}
    </div>
  )
}
