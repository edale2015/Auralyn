/**
 * server/research/sliceGitHubReplitExport.ts
 * Exports an approved slice proposal to a GitHub branch + opens a PR,
 * then appends the Replit slice handoff packet to the same branch.
 *
 * Stores branch name, PR URL, and replitStatus back into slice_proposals.
 */

import { db }                   from "../db";
import { sliceProposals }       from "../../shared/schema";
import { eq }                   from "drizzle-orm";
import { Octokit }              from "@octokit/rest";
import { buildSliceHandoffBundle } from "./replitHandoffBuilder";

function getOctokit() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not configured");
  return new Octokit({ auth: token });
}

export async function exportSliceProposalToGitHubAndReplit(proposalId: number) {
  const rows = await db
    .select()
    .from(sliceProposals)
    .where(eq(sliceProposals.id, proposalId));

  const proposal = rows[0];
  if (!proposal) throw new Error(`Slice proposal ${proposalId} not found`);
  if (!proposal.approved)  throw new Error("Slice proposal must be approved before export");

  const octokit  = getOctokit();
  const owner    = process.env.GITHUB_OWNER!;
  const repo     = process.env.GITHUB_REPO!;
  const base     = process.env.GITHUB_BASE_BRANCH || "main";
  const slug     = proposal.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const branch   = `slice/${proposal.id}-${slug}-${Date.now()}`;

  // 1. Get base SHA
  const baseRef = await octokit.git.getRef({ owner, repo, ref: `heads/${base}` });

  // 2. Create feature branch
  await octokit.git.createRef({
    owner, repo,
    ref: `refs/heads/${branch}`,
    sha: baseRef.data.object.sha,
  });

  // 3. Build and commit Replit handoff packet
  const packet = buildSliceHandoffBundle({
    id:             proposal.id,
    title:          proposal.title,
    rationale:      proposal.rationale,
    affectedFiles:  (proposal.affectedFiles as string[]) ?? [],
    validationPlan: (proposal.validationPlan as string[]) ?? [],
  });

  for (const [filePath, content] of Object.entries(packet)) {
    await octokit.repos.createOrUpdateFileContents({
      owner, repo, branch,
      path:    filePath,
      message: `Slice ${proposal.id}: add ${filePath}`,
      content: Buffer.from(content, "utf8").toString("base64"),
    });
  }

  // 4. Open pull request
  const pr = await octokit.pulls.create({
    owner, repo,
    title: `[Slice Upgrade] ${proposal.title}`,
    head:  branch,
    base,
    body:  [
      `Slice-based proposal export for proposal **#${proposal.id}**.`,
      "",
      `**Rationale:** ${proposal.rationale}`,
      "",
      "**Review and implement only this slice.** Do not roam into unrelated files.",
    ].join("\n"),
  });

  // 5. Update proposal with export status
  await db
    .update(sliceProposals)
    .set({
      githubBranch: branch,
      githubPrUrl:  pr.data.html_url,
      replitStatus: "ready_for_review",
    })
    .where(eq(sliceProposals.id, proposalId));

  return {
    proposalId,
    branchName: branch,
    prUrl:      pr.data.html_url,
    replitInstructions:
      `Open branch ${branch} in Replit, review research/replit/SLICE_REVIEW_PACKET.md, ` +
      `then ask Replit Agent to independently review and implement ONLY this slice.`,
  };
}
