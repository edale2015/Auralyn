import fs from "node:fs";
import path from "node:path";

const ROOTS = ["server", "client", "script", "scripts"];
const exts = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
      walk(full, files);
    } else {
      if (exts.has(path.extname(entry.name))) files.push(full);
    }
  }
  return files;
}

function checkFile(file) {
  const text = fs.readFileSync(file, "utf8");

  const badPatterns = [
    { pattern: /require\(['"][^'"]+['"]\)/g, label: "CommonJS require in ESM file" },
    { pattern: /module\.exports\s*=/g, label: "module.exports in ESM file" }
  ];

  const problems = [];
  for (const { pattern, label } of badPatterns) {
    if (pattern.test(text)) {
      problems.push(label);
    }
  }
  return problems;
}

const files = ROOTS.flatMap((r) => walk(r));
let failed = false;

for (const file of files) {
  const problems = checkFile(file);
  if (problems.length > 0) {
    failed = true;
    console.error(`❌ ${file}`);
    for (const p of problems) {
      console.error(`   - ${p}`);
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log("✅ Import style check passed");
