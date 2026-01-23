import { Request, Response } from "express";
import { execSync } from "child_process";
import fs from "fs";

export function runTests(req: Request, res: Response) {
  try {
    const output = execSync("npm test", {
      encoding: "utf-8",
      stdio: "pipe",
    });
    res.json({ ok: true, output });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      output: err.stdout?.toString(),
      error: err.stderr?.toString(),
    });
  }
}

export function applyPatch(req: Request, res: Response) {
  const { patch } = req.body;
  if (!patch) {
    return res.status(400).json({ ok: false, error: "Missing patch" });
  }

  const tmp = "/tmp/patch.diff";
  fs.writeFileSync(tmp, patch);

  try {
    execSync(`git apply ${tmp}`, { stdio: "pipe" });
    const testOut = execSync("npm test", { encoding: "utf-8" });
    res.json({
      ok: true,
      applied: true,
      tests: "passed",
      output: testOut,
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      applied: false,
      error: err.stderr?.toString(),
    });
  }
}
