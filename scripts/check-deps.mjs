import { execSync } from "node:child_process";

function run(command) {
  return execSync(command, { stdio: "pipe", encoding: "utf8" });
}

try {
  const output = run("npx depcheck --json");
  const result = JSON.parse(output);

  const missing = result.missing || {};
  const invalid = result.invalidFiles || {};
  const unused = result.dependencies || [];
  const unusedDev = result.devDependencies || [];

  const missingKeys = Object.keys(missing);
  const invalidKeys = Object.keys(invalid);

  if (missingKeys.length > 0) {
    console.error("❌ Missing dependencies found:");
    for (const key of missingKeys) {
      console.error(`  - ${key}: ${missing[key].join(", ")}`);
    }
  }

  if (invalidKeys.length > 0) {
    console.error("❌ Invalid files found:");
    for (const key of invalidKeys) {
      console.error(`  - ${key}: ${invalid[key]}`);
    }
  }

  if (unused.length > 0) {
    console.warn("⚠️ Unused dependencies:");
    for (const dep of unused) {
      console.warn(`  - ${dep}`);
    }
  }

  if (unusedDev.length > 0) {
    console.warn("⚠️ Unused devDependencies:");
    for (const dep of unusedDev) {
      console.warn(`  - ${dep}`);
    }
  }

  if (missingKeys.length > 0 || invalidKeys.length > 0) {
    process.exit(1);
  }

  console.log("✅ Dependency manifest check passed");
} catch (err) {
  console.error("❌ Dependency check failed");
  console.error(err?.stdout || err?.message || err);
  process.exit(1);
}
