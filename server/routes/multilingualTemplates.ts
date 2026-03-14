import { Router } from "express"
import { buildTemplateLibrary, getTemplatesByLanguage, autoTranslateTemplate } from "../services/multilingualTemplateLibraryService"

const router = Router()

router.get("/api/multilingual-library", (_req, res) => {
  res.json({ ok: true, library: buildTemplateLibrary() })
})

router.get("/api/multilingual-library/:lang", (req, res) => {
  res.json({ ok: true, templates: getTemplatesByLanguage(req.params.lang) })
})

router.post("/api/multilingual-library/auto-translate", async (req, res) => {
  try {
    const { key, category, sourceText, targetLangs } = req.body
    if (!key || !category || !sourceText || !Array.isArray(targetLangs)) {
      return res.status(400).json({ ok: false, error: "key, category, sourceText, targetLangs[] required" })
    }
    const entry = await autoTranslateTemplate(key, category, sourceText, targetLangs)
    res.json({ ok: true, entry })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
