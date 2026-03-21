# Restore Runbook

## RDS Restore

1. Open AWS RDS console
2. Select the latest automated backup or snapshot for `medscribe-{env}-postgres`
3. Click **Restore to point in time** or **Restore snapshot**
4. Choose a new instance identifier (e.g. `medscribe-prod-postgres-restored`)
5. Update Secrets Manager: set `DATABASE_URL` to the restored instance endpoint
6. Run smoke tests:
   - `GET /health/readyz` → should return `200`
   - `GET /health/healthz/full` → should return all dependencies `ok`
   - `GET /api/ops/summary` → should return `{ api: { ok: true }, db: { ok: true } }`
7. Swap DNS or update load balancer once tests pass

## S3 Artifact Recovery

1. Open the `medscribe-{env}-artifacts` bucket in the AWS S3 console
2. Navigate to the object path and click **Show versions**
3. Select the version to restore and click **Download**
4. To restore in place: use **Copy** and overwrite the current key, or use the CLI:
   ```bash
   aws s3api copy-object \
     --bucket medscribe-prod-artifacts \
     --copy-source "medscribe-prod-artifacts/{key}?versionId={versionId}" \
     --key {key}
   ```
5. Verify checksum and downstream availability

## ElastiCache (Redis)

Redis is not source-of-truth. It holds queue state and hot cache.

Recovery path:
- Restart ECS tasks — BullMQ workers will re-hydrate from DB on reconnect
- In-memory queue jobs will drain and re-enqueue from Postgres-backed state
- No manual restore needed unless cluster is fully lost; in that case, provision a new ElastiCache cluster and update `REDIS_URL` in Secrets Manager

## Emergency Checklist

- [ ] Confirm DB endpoint is live: `psql $DATABASE_URL -c "SELECT 1"`
- [ ] Confirm Redis is reachable: `redis-cli -u $REDIS_URL PING`
- [ ] Confirm `/health/readyz` returns 200 on at least one ECS task
- [ ] Confirm worker heartbeat is updating in the ops dashboard
- [ ] Notify on-call physician if patient intake is affected
