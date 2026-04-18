/**
 * server/research/exportToGitHubAndReplit.ts
 * Legacy (non-slice) export: GitHub branch → Replit handoff bundle.
 *
 * Exports an approved proposed_upgrade to a GitHub feature branch,
 * appends the Replit review packet files, then opens a pull request.
 */

import { db }                       from "../db";
import { proposedUpgrades }         from "../../shared/schema";
import { eq }                       from "drizzle-orm";
import { Octokit }                  from "@octokit/rest";
import { exportUpgradeToGitHub }    from "../integrations/githubExporter";
import { buildReplitHandoffBundle } from "./replitHandoffBuilder";

function getOctokit() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not configured");
  return new Octokit({ auth: token });
}

async function appendFilesToBranch(
  branchName: string,
  files: Record<string, string>,
  upgradeId: number,
) {
  const octokit = getOctokit();
  const owner   = process.env.GITHUB_OWNER!;
  const repo    = process.env.GITHUB_REPO!;

  for (const [filePath, content] of Object.entries(files)) {
    try {
      const existing = await octokit.repos.getContent({
        owner, repo, path: filePath, ref: branchName,
      });

      if (!Array.isArray(existing.data) && "sha" in existing.data) {
        await octokit.repos.createOrUpdateFileContents({
          owner, repo, path: filePath, branch: branchName,
          message: `Research upgrade ${upgradeId}: update ${filePath}`,
          content: Buffer.from(content, "utf8").toString("base64"),
          sha:     existing.data.sha,
        });
      }
    } catch {
      await octokit.repos.createOrUpdateFileContents({
        owner, repo, path: filePath, branch: branchName,
        message: `Research upgrade ${upgradeId}: add ${filePath}`,
        content: Buffer.from(content, "utf8").toString("base64"),
      });
    }
  }
}

export async function exportProposalForGitHubThenReplit(proposalId: number) {
  const rows = await db
    .select()
    .from(proposedUpgrades)
    .where(eq(proposedUpgrades.id, proposalId));

  const proposal = rows[0];
  if (!proposal) throw new Error("Proposal not found");
  if (!proposal.approved) throw new Error("Proposal must be approved first");

  // Step 1: create GitHub branch + PR
  const ghExport = await exportUpgradeToGitHub(proposalId);

  // Step 2: fetch matching cross-model review for richer context
  const reviewRows = await db.execute(
    `SELECT * FROM cross_model_reviews WHERE article_id = $1 ORDER BY id DESC LIMIT 1`,
    [proposal.articleId],
  );
  const review: any = (reviewRows as any).rows?.[0];
  const openaiReview = review?.openai_review as any;

  const matchingUpgrade =
    openaiReview?.recommendedUpgrades?.find(
      (u: any) => u.title === proposal.title,
    ) ?? null;

  // Step 3: build Replit handoff files
  const replitBundle = buildReplitHandoffBundle({
    proposalId:          proposal.id,
    title:               proposal.title,
    rationale:           proposal.rationale,
    claudeRecommendations: review?.claude_recommendations ?? "",
    openaiSummary:       review?.openai_summary ?? "",
    affectedFiles:       (proposal.affectedFiles as string[]) ?? [],
    codeRecommendations: matchingUpgrade?.codeRecommendations ?? [],
    validationPlan:      (proposal.validationPlan as string[]) ?? [],
  });

  // Step 4: commit handoff files to the branch
  await appendFilesToBranch(ghExport.branchName, replitBundle, proposal.id);

  return {
    ...ghExport,
    replitHandoffFiles: Object.keys(replitBundle),
    replitInstructions:
      `In Replit, sync branch ${ghExport.branchName}, open ` +
      `research/replit/REVIEW_PACKET.md and IMPLEMENTATION_TASK.md, ` +
      `then use Agent with medium/high code review settings and the provided AGENT_SKILL.md.`,
  };
}
