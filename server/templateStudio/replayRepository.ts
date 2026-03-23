import fs from "fs/promises";
import path from "path";
import type { ReplaySession } from "../../shared/replayInspector";

const DATA_DIR = path.join(process.cwd(), "data", "template-studio", "replays");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export class ReplayRepository {
  async list(): Promise<ReplaySession[]> {
    await ensureDir();
    const files = await fs.readdir(DATA_DIR);
    const sessions: ReplaySession[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(DATA_DIR, file), "utf8");
      sessions.push(JSON.parse(raw));
    }
    return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async get(replayId: string): Promise<ReplaySession | null> {
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, `${replayId}.json`), "utf8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async save(session: ReplaySession) {
    await ensureDir();
    await fs.writeFile(
      path.join(DATA_DIR, `${session.replayId}.json`),
      JSON.stringify(session, null, 2),
      "utf8"
    );
  }
}
