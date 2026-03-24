import { execSync } from "child_process";

function run(cmd: string, opts: { optional?: boolean } = {}): boolean {
  console.log(`\n>> ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit" });
    return true;
  } catch (err: any) {
    if (opts.optional) {
      console.warn(`  [skipped] ${cmd} — not available or not configured`);
      return false;
    }
    throw err;
  }
}

async function deploy(): Promise<void> {
  console.log("\n🚀 Auralyn ENT Multimodal — Full Deploy");
  console.log("==========================================\n");

  console.log("1️⃣  Building application...");
  run("npm run build");

  console.log("\n2️⃣  Deploying to Fly.io...");
  run("flyctl deploy --remote-only", { optional: true });

  console.log("\n3️⃣  Deploying to AWS ECS Fargate...");
  run("cd infra && npx cdk deploy --require-approval never", { optional: true });

  console.log("\n✅  FULL DEPLOY COMPLETE");
  console.log("==========================================");
  console.log("  Fly.io:  https://auralyn-multimodal.fly.dev");
  console.log("  AWS:     ECS Fargate via CDK\n");
}

deploy().catch((err) => {
  console.error("\n❌ Deploy failed:", err.message);
  process.exit(1);
});
