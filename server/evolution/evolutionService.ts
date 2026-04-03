import { pool } from '../db';
import { logger } from '../utils/logger';

export type ProposalStatus =
  | 'pending'
  | 'staging'
  | 'approved'
  | 'rejected'
  | 'canary'
  | 'promoted'
  | 'rolled_back';

export interface EvolutionProposalInput {
  proposalId: string;
  targetAgent: string;
  parameterChange: Record<string, unknown>;
  rationale: string;
  urgency: 'low' | 'medium' | 'high';
  proposedBy: string;
}

export interface EvolutionProposal extends EvolutionProposalInput {
  status: ProposalStatus;
  approvedBy?: string;
  rollbackReason?: string;
  proposedAt: Date;
  approvedAt?: Date;
  stagedAt?: Date;
  canaryStartedAt?: Date;
  rolledBackAt?: Date;
  rejectedAt?: Date;
}

export class EvolutionService {
  async createProposal(input: EvolutionProposalInput): Promise<void> {
    await pool.query(
      `INSERT INTO evolution_proposals
         (proposal_id, target_agent, parameter_change, rationale, urgency, status, proposed_by, proposed_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW())`,
      [
        input.proposalId,
        input.targetAgent,
        JSON.stringify(input.parameterChange),
        input.rationale,
        input.urgency,
        input.proposedBy,
      ],
    );
    logger.info('[EvolutionService] Proposal created', { proposalId: input.proposalId, target: input.targetAgent });
  }

  async approveProposal(proposalId: string, approvedBy: string): Promise<void> {
    await pool.query(
      `UPDATE evolution_proposals SET status = 'approved', approved_by = $2, approved_at = NOW() WHERE proposal_id = $1`,
      [proposalId, approvedBy],
    );
    logger.info('[EvolutionService] Proposal approved', { proposalId, approvedBy });
  }

  async moveToStaging(proposalId: string): Promise<void> {
    await pool.query(
      `UPDATE evolution_proposals SET status = 'staging', staged_at = NOW() WHERE proposal_id = $1`,
      [proposalId],
    );
    logger.info('[EvolutionService] Proposal moved to staging', { proposalId });
  }

  async validateAndCanary(
    proposalId: string,
    validator: () => Promise<{ escalationCasesPass: boolean; overallPassRate: number }>,
  ): Promise<{ promoted: boolean; reason: string }> {
    const result = await validator();
    if (!result.escalationCasesPass || result.overallPassRate < 0.9) {
      await pool.query(
        `UPDATE evolution_proposals SET status = 'rejected', rejected_at = NOW() WHERE proposal_id = $1`,
        [proposalId],
      );
      logger.warn('[EvolutionService] Proposal rejected (validation failed)', {
        proposalId,
        passRate: result.overallPassRate,
        escalationPass: result.escalationCasesPass,
      });
      return { promoted: false, reason: 'Validation thresholds not met' };
    }

    await pool.query(
      `UPDATE evolution_proposals SET status = 'canary', canary_started_at = NOW() WHERE proposal_id = $1`,
      [proposalId],
    );
    logger.info('[EvolutionService] Proposal entering canary', { proposalId });
    return { promoted: true, reason: 'Ready for 10% canary rollout' };
  }

  async rollbackProposal(proposalId: string, reason: string): Promise<void> {
    await pool.query(
      `UPDATE evolution_proposals SET status = 'rolled_back', rollback_reason = $2, rolled_back_at = NOW() WHERE proposal_id = $1`,
      [proposalId, reason],
    );
    logger.warn('[EvolutionService] Proposal rolled back', { proposalId, reason });
  }

  async getProposal(proposalId: string): Promise<EvolutionProposal | null> {
    const r = await pool.query(
      `SELECT * FROM evolution_proposals WHERE proposal_id = $1`,
      [proposalId],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      proposalId: row.proposal_id,
      targetAgent: row.target_agent,
      parameterChange: row.parameter_change,
      rationale: row.rationale,
      urgency: row.urgency,
      status: row.status,
      proposedBy: row.proposed_by,
      approvedBy: row.approved_by,
      rollbackReason: row.rollback_reason,
      proposedAt: row.proposed_at,
      approvedAt: row.approved_at,
      stagedAt: row.staged_at,
      canaryStartedAt: row.canary_started_at,
      rolledBackAt: row.rolled_back_at,
      rejectedAt: row.rejected_at,
    };
  }

  async listProposals(status?: ProposalStatus): Promise<EvolutionProposal[]> {
    const r = status
      ? await pool.query(`SELECT * FROM evolution_proposals WHERE status = $1 ORDER BY proposed_at DESC`, [status])
      : await pool.query(`SELECT * FROM evolution_proposals ORDER BY proposed_at DESC`);
    return r.rows.map(row => ({
      proposalId: row.proposal_id,
      targetAgent: row.target_agent,
      parameterChange: row.parameter_change,
      rationale: row.rationale,
      urgency: row.urgency,
      status: row.status,
      proposedBy: row.proposed_by,
      approvedBy: row.approved_by,
      rollbackReason: row.rollback_reason,
      proposedAt: row.proposed_at,
      approvedAt: row.approved_at,
      stagedAt: row.staged_at,
      canaryStartedAt: row.canary_started_at,
      rolledBackAt: row.rolled_back_at,
      rejectedAt: row.rejected_at,
    }));
  }
}

export const evolutionService = new EvolutionService();
