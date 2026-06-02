---
name: Production death spiral fix
description: Root cause and fix for the event loop blocking (19s) and DB latency (21s) seen in production.
---

## The Problem
`setInterval` fires its async callback repeatedly regardless of whether the previous invocation has finished. When a DB-touching loop (e.g. `recoveryLoop`, `governorLoop`) takes longer than its interval (10s/30s), new cycles start before old ones complete. Each new cycle calls `primaryPool.connect()` to check the DB. With a pool size of 20, this fills all connections within minutes, causing ALL new DB queries to wait — including simple `SELECT 1` health checks that then also pile up.

Death spiral sequence:
1. DB gets briefly slow (any reason — cold start, GoldenMonitor run, KB cache warm-up)
2. RecoveryLoop fires every 10s, each waits for a DB connection
3. After ~3 minutes (20 connections × 10s interval), pool is exhausted
4. New queries wait up to `connectionTimeoutMillis` (5s) before failing
5. Event loop blocks for 19+ seconds — all clinical requests time out

## Fixes Applied

### `server/system/recoveryLoop.ts`
- Added `let _isRunning = false` flag
- `runCycle()` returns immediately if `_isRunning` is true
- Sets `_isRunning = true` in try, resets in finally
- Increased default interval from 10s to 30s
- `index.ts` call updated from `startRecoveryLoop(10_000)` to `startRecoveryLoop(30_000)`

### `server/governor/governorLoop.ts`
- Added `let _iterRunning = false` flag
- `setInterval` callback returns immediately if `_iterRunning` is true
- Resets in finally block

### `server/db/dbRouter.ts`
- `dbHealthCheck()` now sets `statement_timeout = 3000` before `SELECT 1`
- Uses `try/finally` to always release the pool connection
- Prevents a single stuck health check from holding a connection indefinitely

### `server/system/engineScheduler.ts`
- Added `let _predRunning = false` flag to `safeFailurePrediction` (runs every 30s, does DB SELECT)
- Removed unused `safeLearningCycle` function (it still called `runLearningCycle` but was never scheduled)

**Why:** setInterval does not `await` the previous callback before firing the next. Every async loop that touches the DB needs a concurrency guard.

**How to apply:** Any new `setInterval` that calls an async function doing DB work must check a `_isRunning` flag before executing, and reset it in a `finally` block.
