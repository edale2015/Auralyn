#!/usr/bin/env bash
set -euo pipefail

mkdir -p server/system server/routes server/phase6/controlTower

cat > server/system/runAutonomousPipeline.ts <<'EOF'
import crypto from "node:crypto";
import { runFullClinicalFlow } from "./runFullClinicalFlow.js";

export async function runAutonomousPipeline(ctx: any) {
  const startedAt = Date.now();

  try {
    const result = await runFullClinicalFlow(ctx?.input ?? ctx);

    return {
      ...result,
      _meta: {
        pipeline: "autonomous",
        requestId: crypto.randomUUID(),
        durationMs: Date.now() - startedAt,
        timestamp: Date.now()
      }
    };
  } catch (error) {
    const err = error as Error;

    return {
      error: "pipeline_failed",
      message: err.message,
      _meta: {
        pipeline: "autonomous",
        failed: true,
        timestamp: Date.now()
      }
    };
  }
}
EOF

cat > server/routes/unifiedRoutes.ts <<'EOF'
import { Router } from "express";
import { runAutonomousPipeline } from "../system/runAutonomousPipeline.js";

const router = Router();

router.post("/run", async (req, res) => {
  const result = await runAutonomousPipeline(req.body);
  res.json(result);
});

export default router;
EOF

mkdir -p server/phase6/controlTower
cat > server/phase6/controlTower/controlTowerFeed.ts <<'EOF'
export function getControlTowerData() {
  return {
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now()
  };
}
EOF

cat > server/routes/controlTowerRoutes.ts <<'EOF'
import { Router } from "express";
import { getControlTowerData } from "../phase6/controlTower/controlTowerFeed.js";

const router = Router();

router.get("/control-tower", (_req, res) => {
  res.json(getControlTowerData());
});

export default router;
EOF

cat > server/routes/executiveRoutes.ts <<'EOF'
import { Router } from "express";

const router = Router();

router.get("/executive", (_req, res) => {
  res.json({
    system: "Med-Scribe AI",
    status: "operational",
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

export default router;
EOF

echo
echo "Patch files created."
echo
echo "Now patch server/index.ts manually:"
echo '  import unifiedRoutes from "./routes/unifiedRoutes.js";'
echo '  import controlTowerRoutes from "./routes/controlTowerRoutes.js";'
echo '  import executiveRoutes from "./routes/executiveRoutes.js";'
echo
echo '  app.use("/api", unifiedRoutes);'
echo '  app.use("/api", controlTowerRoutes);'
echo '  app.use("/api", executiveRoutes);'
