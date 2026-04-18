/**
 * server/integrations/githubExporter.ts
 * GitHub Exporter — creates a branch + PR for each approved upgrade.
 *
 * Uses @octokit/rest with a fine-grained personal access token.
 * Required environment variables:
 *   GITHUB_TOKEN       — fine-grained PAT with Contents + Pull Requests write
 *   GITHUB_OWNER       — GitHub org or username
 *   GITHUB_REPO        — repository name
 *   GITHUB_BASE_BRANCH — base branch (default: "main")
 *
 * SAFETY: only runs when upgrade.approved === true.
 * All changes are committed to a feature branch — never directly to main.
 * Branch protection rules on GitHub control who can merge.
 */

import { Octokit } from "@octokit/rest";
import { db } from "../db";
import { proposedUpgrades, githubExports } from "../../shared/schema";
import { eq } from "drizzle-orm";

const GITHUB_OWNER       = process.env.GITHUB_OWNER        ?? "";
const GITHUB_REPO        = process.env.GITHUB_REPO         ?? "";
const GITHUB_BASE_BRANCH = process.env.GITHUB_BASE_BRANCH  ?? "main";

function getOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not configured — set it in environment secrets");
  return new Octokit({ auth: token });
}

function isGitHubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO);
}

export { isGitHubConfigured };

export async function exportUpgradeToGitHub(upgradeId: number) {
  if (!isGitHubConfigured()) {
    throw new Error(
      "GitHub not configured — set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO environment variables. " +
      "See the GitHub setup guide in the Research Inbox for step-by-step instructions."
    );
  }

  const rows = await db.select().from(proposedUpgrades).where(eq(proposedUpgrades.id, upgradeId));
  const upgrade = rows[0];
  if (!upgrade) throw new Error(`Proposed upgrade ${upgradeId} not found`);

  if (!upgrade.approved) {
    throw new Error(
      `Upgrade ${upgradeId} is not approved. Approve it first via POST /api/research/approve/${upgradeId}.`
    );
  }

  if (upgrade.validationStatus !== "passed") {
    throw new Error(`Upgrade ${upgradeId} validation status is "${upgrade.validationStatus}" — must be "passed"`);
  }

  const octokit    = getOctokit();
  const branchName = `research-upgrade/${upgradeId}-${Date.now()}`;

  // Get the base branch SHA
  const baseRef = await octokit.git.getRef({
    owner: GITHUB_OWNER,
    repo:  GITHUB_REPO,
    ref:   `heads/${GITHUB_BASE_BRANCH}`,
  });
  const baseSha = baseRef.data.object.sha;

  // Create feature branch
  await octokit.git.createRef({
    owner: GITHUB_OWNER,
    repo:  GITHUB_REPO,
    ref:   `refs/heads/${branchName}`,
    sha:   baseSha,
  });

  // Commit each file in the patch bundle
  const patchBundle = (upgrade.patchBundle ?? {}) as Record<string, string>;
  let lastCommitSha  = baseSha;

  for (const [filePath, content] of Object.entries(patchBundle)) {
    const encodedContent = Buffer.from(content, "utf8").toString("base64");
    const commitMessage  = `[research-upgrade #${upgradeId}] ${filePath}`;

    try {
      // Try to update existing file (need its SHA)
      const existing = await octokit.repos.getContent({
        owner: GITHUB_OWNER,
        repo:  GITHUB_REPO,
        path:  filePath,
        ref:   branchName,
      });

      if (!Array.isArray(existing.data) && "sha" in existing.data) {
        const result = await octokit.repos.createOrUpdateFileContents({
          owner:   GITHUB_OWNER,
          repo:    GITHUB_REPO,
          path:    filePath,
          message: commitMessage,
          content: encodedContent,
          branch:  branchName,
          sha:     existing.data.sha,
        });
        lastCommitSha = result.data.commit.sha ?? lastCommitSha;
      }
    } catch {
      // File doesn't exist yet — create it
      const result = await octokit.repos.createOrUpdateFileContents({
        owner:   GITHUB_OWNER,
        repo:    GITHUB_REPO,
        path:    filePath,
        message: commitMessage,
        content: encodedContent,
        branch:  branchName,
      });
      lastCommitSha = result.data.commit.sha ?? lastCommitSha;
    }
  }

  // Open pull request
  const affectedFiles = (upgrade.affectedFiles as string[]) ?? [];
  const validationPlan = (upgrade.validationPlan as string[]) ?? [];

  const pr = await octokit.pulls.create({
    owner: GITHUB_OWNER,
    repo:  GITHUB_REPO,
    title: `[Research Upgrade #${upgradeId}] ${upgrade.title}`,
    head:  branchName,
    base:  GITHUB_BASE_BRANCH,
    body:  [
      `## Research Upgrade #${upgradeId}`,
      ``,
      `**Title:** ${upgrade.title}`,
      ``,
      `**Rationale:** ${upgrade.rationale}`,
      ``,
      `**Validation status:** ${upgrade.validationStatus}`,
      `**Approved by:** ${upgrade.approvedBy}`,
      ``,
      `**Affected files:**`,
      ...affectedFiles.map(f => `- \`${f}\``),
      ``,
      `**Validation plan:**`,
      ...validationPlan.map(v => `- ${v}`),
      ``,
      `---`,
      `*This PR was generated by the Auralyn Research Pipeline.*`,
      `*It requires human code review and passing CI before merge.*`,
      `*Do not merge without physician + engineering sign-off.*`,
    ].join("\n"),
  });

  // Record the export
  const inserted = await db
    .insert(githubExports)
    .values({
      proposedUpgradeId: upgrade.id,
      branchName,
      commitSha: lastCommitSha,
      prNumber:  pr.data.number,
      prUrl:     pr.data.html_url,
      status:    "opened",
    })
    .returning();

  console.log(`[githubExporter] PR #${pr.data.number} opened: ${pr.data.html_url}`);
  return inserted[0];
}
