#!/usr/bin/env bash
set -euo pipefail

mkdir -p server/routes server/system server/phase6/controlTower

cat > package.json <<'EOF'
{
  "name": "medscribe-replit-import",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx server/index.ts",
    "dev": "tsx watch server/index.ts"
  },
  "dependencies": {
    "express": "^4.19.2"
  },
  "devDependencies": {
    "@types/express": "^5.0.1",
    "@types/node": "^22.10.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
EOF

cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["server/**/*.ts"]
}
EOF

cat > server/index.ts <<'EOF'
import express from "express";
import unifiedRoutes from "./routes/unifiedRoutes.js";
import controlTowerRoutes from "./routes/controlTowerRoutes.js";
import executiveRoutes from "./routes/executiveRoutes.js";

const app = express();
app.use(express.json());

app.use("/api", unifiedRoutes);
app.use("/api", controlTowerRoutes);
app.use("/api", executiveRoutes);

app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), timestamp: Date.now() });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`MedScribe server running on port ${port}`);
});
EOF

cat > server/system/runFullClinicalFlow.ts <<'EOF'
export async function runFullClinicalFlow(input: unknown) {
  return {
    diagnosis: "viral_pharyngitis",
    confidence: 0.82,
    reasoning: "Stub clinical engine. Replace this function with your real Med-Scribe logic.",
    input
  };
}
EOF

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

echo "Files created. Now run: npm install && npm run dev"
EOF
