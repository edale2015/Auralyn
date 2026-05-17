-- Migration: context_metrics_daily table for T020 daily telemetry aggregation
-- Populated by a 04:00 UTC cron job that aggregates structured logs.

CREATE TABLE IF NOT EXISTS context_metrics_daily (
  id               BIGSERIAL PRIMARY KEY,
  metric_date      DATE        NOT NULL,
  tenant_id        TEXT        NOT NULL DEFAULT 'global',
  metric_name      TEXT        NOT NULL,
  metric_value_p50 NUMERIC(10,4),
  metric_value_p95 NUMERIC(10,4),
  metric_value_p99 NUMERIC(10,4),
  count            INT         NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cmd_date_tenant_metric
  ON context_metrics_daily (metric_date, tenant_id, metric_name);

CREATE INDEX IF NOT EXISTS idx_cmd_metric_date
  ON context_metrics_daily (metric_name, metric_date DESC);

COMMENT ON TABLE context_metrics_daily IS
  'Daily aggregates of auralyn.context.* metrics from structured application logs. '
  'Written by the 04:00 UTC telemetry aggregation job. '
  'Read by /api/context-health/24h (falls back to in-process ring buffer when table is empty).';
