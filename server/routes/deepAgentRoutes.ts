import { Router } from "express";
import {
  safeRunDeepAgent,
  checkDeepAgentHealth,
  DeepAgentRunRequest,
} from "../services/deepAgentClient";
import {
  runUploadedArticleUpgrade,
  runKbAuditFromSource,
  parseUpgradeOutput,
} from "../services/deepAgentUpgradeOrchestrator";

const router = Router();

router.get("/health", async (_req, res) => {
  try {
    const health = await checkDeepAgentHealth();
    res.json(health);
  } catch (err: any) {
    res.json({ ok: false, error: err.message || "Deep Agent service not reachable" });
  }
});

router.post("/run", async (req, res) => {
  try {
    const payload = req.body as DeepAgentRunRequest;
    if (!payload.session_id || !payload.user_prompt) {
      return res.status(400).json({ ok: false, error: "session_id and user_prompt required" });
    }
    const result = await safeRunDeepAgent(payload);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Unknown error" });
  }
});

router.post("/article-compare", async (req, res) => {
  try {
    const {
      sessionId,
      articleText,
      currentSystemSummary,
      currentModuleName,
      additionalContext,
    } = req.body;

    const result = await safeRunDeepAgent({
      session_id: sessionId || `article-compare-${Date.now()}`,
      task_type: "article_compare",
      user_prompt: `
Compare the uploaded article/notes against the current system and produce:
1. architecture additions
2. exact integration points
3. proposed services/modules/routes
4. safety considerations
5. rollout steps
6. machine-readable change proposals

Current module: ${currentModuleName || "unspecified"}
`,
      attachments: {
        "article_input.txt": articleText || "",
      },
      context: {
        currentSystemSummary,
        currentModuleName,
        additionalContext,
      },
      write_artifacts: true,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Unknown error" });
  }
});

router.post("/kb-audit", async (req, res) => {
  try {
    const {
      sessionId,
      sourceText,
      kbSnapshot,
      complaintFlows,
      rulesContext,
      moduleName,
    } = req.body;

    const result = await runKbAuditFromSource({
      sessionId,
      sourceText,
      kbSnapshot,
      complaintFlows,
      rulesContext,
      moduleName,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Unknown error" });
  }
});

router.post("/code-review", async (req, res) => {
  try {
    const { sessionId, files, moduleName, architectureContext } = req.body;

    const attachments: Record<string, string> = {};
    for (const file of files || []) {
      attachments[file.path] = file.content;
    }

    const result = await safeRunDeepAgent({
      session_id: sessionId || `code-review-${Date.now()}`,
      task_type: "code_review",
      user_prompt: `
Review the supplied code for:
- correctness
- reliability
- safety
- observability
- maintainability
- integration quality

Return prioritized recommendations plus implementation plan.
`,
      attachments,
      context: {
        moduleName,
        architectureContext,
      },
      write_artifacts: true,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Unknown error" });
  }
});

router.post("/workflow-upgrade", async (req, res) => {
  try {
    const { sessionId, description, currentWorkflow, targetOutcome, context } = req.body;

    const result = await safeRunDeepAgent({
      session_id: sessionId || `workflow-upgrade-${Date.now()}`,
      task_type: "workflow_upgrade",
      user_prompt: `
Map the proposed workflow improvement into concrete changes:
- API changes
- DB schema changes
- orchestration changes
- dashboards
- audit trails
- rollout/safety gates

Target outcome: ${targetOutcome || "unspecified"}
Description: ${description || ""}
`,
      attachments: {
        "current_workflow.json": JSON.stringify(currentWorkflow || {}, null, 2),
      },
      context: context || {},
      write_artifacts: true,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Unknown error" });
  }
});

router.post("/upgrade-from-article", async (req, res) => {
  try {
    const {
      articleText,
      moduleName,
      currentKbSummary,
      currentFlowSummary,
      currentArchitectureSummary,
    } = req.body;

    if (!articleText) {
      return res.status(400).json({ ok: false, error: "articleText required" });
    }

    const result = await runUploadedArticleUpgrade({
      articleText,
      moduleName: moduleName || "unspecified",
      currentKbSummary: currentKbSummary || {},
      currentFlowSummary: currentFlowSummary || {},
      currentArchitectureSummary: currentArchitectureSummary || {},
    });

    res.json({
      ...result,
      parsed: parseUpgradeOutput(result),
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Unknown error" });
  }
});

router.post("/research", async (req, res) => {
  try {
    const { sessionId, topic, context, attachments } = req.body;

    const result = await safeRunDeepAgent({
      session_id: sessionId || `research-${Date.now()}`,
      task_type: "research",
      user_prompt: topic || "Perform clinical research and return structured findings.",
      attachments: attachments || {},
      context: context || {},
      write_artifacts: true,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Unknown error" });
  }
});

export default router;
