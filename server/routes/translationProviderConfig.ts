import { Router } from "express"
import { getTranslationProviderConfig } from "../services/translationProviderConfigService"
import { batchTranslate, detectLanguage } from "../services/translationRealProviderService"

const router = Router()

router.get("/api/translation-provider/config", (_req, res) => {
  res.json({ ok: true, config: getTranslationProviderConfig() })
})

router.post("/api/translation-provider/translate", async (req, res) => {
  try {
    const { texts, targetLang, sourceLang } = req.body
    if (!Array.isArray(texts) || !targetLang) {
      return res.status(400).json({ ok: false, error: "texts (array) and targetLang required" })
    }
    const result = await batchTranslate({ texts, targetLang, sourceLang })
    res.json({ ok: true, ...result })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.post("/api/translation-provider/detect", async (req, res) => {
  try {
    const { text } = req.body
    if (!text) return res.status(400).json({ ok: false, error: "text required" })
    const result = await detectLanguage(text)
    res.json({ ok: true, ...result })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
