import { pool } from '../db';
import { logger } from '../utils/logger';

export interface TenantConfigRecord {
  tenantId: string;
  featureFlags: Record<string, boolean>;
  capacityRules: Record<string, unknown>;
  caseMixConfig: Record<string, unknown>;
  version: number;
  updatedAt: Date;
  updatedBy: string;
}

export class TenantConfigService {
  async getTenantConfig(tenantId: string): Promise<TenantConfigRecord | null> {
    const r = await pool.query(
      `SELECT tenant_id, feature_flags, capacity_rules, case_mix_config, version, updated_at, updated_by
       FROM tenant_configs WHERE tenant_id = $1`,
      [tenantId],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      tenantId: row.tenant_id,
      featureFlags: row.feature_flags ?? {},
      capacityRules: row.capacity_rules ?? {},
      caseMixConfig: row.case_mix_config ?? {},
      version: row.version,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }

  async upsertTenantConfig(
    input: Omit<TenantConfigRecord, 'updatedAt' | 'version'> & { version?: number },
  ): Promise<TenantConfigRecord> {
    const existing = await this.getTenantConfig(input.tenantId);
    const version = (existing?.version ?? 0) + 1;

    await pool.query(
      `INSERT INTO tenant_configs
         (tenant_id, feature_flags, capacity_rules, case_mix_config, version, updated_at, updated_by)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)
       ON CONFLICT (tenant_id) DO UPDATE SET
         feature_flags = EXCLUDED.feature_flags,
         capacity_rules = EXCLUDED.capacity_rules,
         case_mix_config = EXCLUDED.case_mix_config,
         version = EXCLUDED.version,
         updated_at = NOW(),
         updated_by = EXCLUDED.updated_by`,
      [
        input.tenantId,
        JSON.stringify(input.featureFlags),
        JSON.stringify(input.capacityRules),
        JSON.stringify(input.caseMixConfig),
        version,
        input.updatedBy,
      ],
    );

    const latest = await this.getTenantConfig(input.tenantId);
    if (!latest) throw new Error(`Tenant config write failed for ${input.tenantId}`);
    logger.info('[TenantConfigService] Config upserted', { tenantId: input.tenantId, version });
    return latest;
  }

  async listAllTenants(): Promise<TenantConfigRecord[]> {
    const r = await pool.query(
      `SELECT tenant_id, feature_flags, capacity_rules, case_mix_config, version, updated_at, updated_by
       FROM tenant_configs ORDER BY updated_at DESC`,
    );
    return r.rows.map(row => ({
      tenantId: row.tenant_id,
      featureFlags: row.feature_flags ?? {},
      capacityRules: row.capacity_rules ?? {},
      caseMixConfig: row.case_mix_config ?? {},
      version: row.version,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    }));
  }
}

export const tenantConfigService = new TenantConfigService();
