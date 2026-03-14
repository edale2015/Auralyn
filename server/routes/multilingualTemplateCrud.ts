import { Router } from "express"
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getAvailableLangs,
  getAvailableCategories,
} from "../services/multilingualTemplateCrudService"

const router = Router()

router.get("/api/multilingual-templates", (req, res) => {
  const { lang, category } = req.query as Record<string, string>
  res.json({
    ok: true,
    templates: listTemplates(lang, category),
    langs: getAvailableLangs(),
    categories: getAvailableCategories(),
  })
})

router.get("/api/multilingual-templates/:id", (req, res) => {
  const t = getTemplate(req.params.id)
  if (!t) return res.status(404).json({ ok: false, error: "Not found" })
  res.json({ ok: true, template: t })
})

router.post("/api/multilingual-templates", (req, res) => {
  const { key, category, lang, text, variables, createdBy } = req.body
  if (!key || !category || !lang || !text) {
    return res.status(400).json({ ok: false, error: "key, category, lang, text required" })
  }
  const t = createTemplate({ key, category, lang, text, variables: variables ?? [], createdBy: createdBy ?? "api" })
  res.json({ ok: true, template: t })
})

router.patch("/api/multilingual-templates/:id", (req, res) => {
  const t = updateTemplate(req.params.id, req.body)
  if (!t) return res.status(404).json({ ok: false, error: "Not found" })
  res.json({ ok: true, template: t })
})

router.delete("/api/multilingual-templates/:id", (req, res) => {
  const ok = deleteTemplate(req.params.id)
  if (!ok) return res.status(404).json({ ok: false, error: "Not found" })
  res.json({ ok: true })
})

export default router
