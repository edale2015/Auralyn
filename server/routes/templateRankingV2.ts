import { Router } from "express"
import { getRankedTemplates } from "../services/templateRankingV2Service"

const router = Router()

router.get("/api/template-ranking/v2", (req, res) => {
  const { lang, category } = req.query as Record<string, string>
  res.json({ ok: true, templates: getRankedTemplates(lang ?? "en", category) })
})

export default router
