import { logEngineTrace } from '../engines/engineTraceLogger';

export interface BrainContext {
  complaint: string;
  patientData?: Record<string, unknown>;
  caseId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

export interface BrainEngine {
  name: string;
  run(context: BrainContext): BrainContext | Promise<BrainContext>;
  enabled?: boolean;
}

export interface PipelineResult {
  context: BrainContext;
  engineLog: Array<{ engine: string; durationMs: number; outputKeys: string[] }>;
  totalDurationMs: number;
  completedAt: string;
}

export class ClinicalBrain {
  private _engines: BrainEngine[] = [];

  get engines(): BrainEngine[] {
    return this._engines;
  }

  register(engine: BrainEngine): this {
    if (!engine.name) throw new Error('Engine must have a name');
    this._engines.push(engine);
    return this;
  }

  unregister(engineName: string): this {
    this._engines = this._engines.filter((e) => e.name !== engineName);
    return this;
  }

  getEngine(name: string): BrainEngine | undefined {
    return this._engines.find((e) => e.name === name);
  }

  async runPipeline(context: BrainContext): Promise<PipelineResult> {
    const globalStart = Date.now();
    let state = { ...context };
    const engineLog: PipelineResult['engineLog'] = [];

    const activeEngines = this._engines.filter((e) => e.enabled !== false);

    for (const engine of activeEngines) {
      const start = Date.now();
      try {
        const output = await engine.run(state);
        const durationMs = Date.now() - start;
        const newKeys = Object.keys(output).filter((k) => !(k in state));
        state = output;
        engineLog.push({ engine: engine.name, durationMs, outputKeys: newKeys });
        logEngineTrace(engine.name, { outputKeys: newKeys }, {
          sessionId: context.sessionId,
          caseId: context.caseId,
          startTime: start,
          input: { complaint: context.complaint },
        });
      } catch (err: any) {
        console.error(`[ClinicalBrain] Engine ${engine.name} failed:`, err.message);
        engineLog.push({ engine: engine.name, durationMs: Date.now() - start, outputKeys: [] });
      }
    }

    return {
      context: state,
      engineLog,
      totalDurationMs: Date.now() - globalStart,
      completedAt: new Date().toISOString(),
    };
  }

  async runSingle(engineName: string, context: BrainContext): Promise<BrainContext> {
    const engine = this.getEngine(engineName);
    if (!engine) throw new Error(`Engine ${engineName} not registered`);
    return engine.run(context);
  }

  describe(): { totalEngines: number; activeEngines: number; engines: string[] } {
    return {
      totalEngines: this._engines.length,
      activeEngines: this._engines.filter((e) => e.enabled !== false).length,
      engines: this._engines.map((e) => e.name),
    };
  }
}

export const clinicalBrain = new ClinicalBrain();
