/**
 * Workflow Engine — n8n-style composable step pipeline (HIPAA-safe, internal)
 * Chain async steps with error handling, timing, and per-step audit logging.
 */

export type WorkflowStep<T = any, R = any> = (input: T) => Promise<R>;

export interface StepResult {
  stepIndex: number;
  name:      string;
  durationMs:number;
  success:   boolean;
  error?:    string;
}

export interface WorkflowRunResult<T = any> {
  output:     T;
  steps:      StepResult[];
  totalMs:    number;
  success:    boolean;
}

export class Workflow<TInput = any, TOutput = any> {
  private steps:     Array<{ fn: WorkflowStep; name: string }> = [];
  private onStepLog: ((r: StepResult) => void) | null = null;

  add<R>(step: WorkflowStep<any, R>, name = `step_${this.steps.length + 1}`): Workflow<TInput, R> {
    this.steps.push({ fn: step, name });
    return this as any;
  }

  onLog(cb: (r: StepResult) => void): this {
    this.onStepLog = cb;
    return this;
  }

  async run(input: TInput): Promise<WorkflowRunResult<TOutput>> {
    let data: any   = input;
    const results:  StepResult[] = [];
    const wallStart = Date.now();

    for (let i = 0; i < this.steps.length; i++) {
      const { fn, name } = this.steps[i];
      const t0 = Date.now();
      try {
        data = await fn(data);
        const sr: StepResult = { stepIndex: i, name, durationMs: Date.now() - t0, success: true };
        results.push(sr);
        this.onStepLog?.(sr);
      } catch (err: any) {
        const sr: StepResult = { stepIndex: i, name, durationMs: Date.now() - t0, success: false, error: String(err) };
        results.push(sr);
        this.onStepLog?.(sr);
        console.error(`[Workflow] Error at step "${name}":`, err);
        throw err;
      }
    }

    return { output: data as TOutput, steps: results, totalMs: Date.now() - wallStart, success: true };
  }
}

// ── Example: Full patient intake → RAG → specialist workflow ─────────────────
export interface PatientWorkflowInput {
  patientId?: string;
  symptoms:   string;
  vitals?:    Record<string, number>;
}

export function buildPatientWorkflow() {
  return new Workflow<PatientWorkflowInput>()
    .add(async (input) => {
      console.log("[Workflow] Step 1: Intake — validating patient data");
      if (!input.symptoms) throw new Error("symptoms required");
      return { ...input, intakeAt: new Date().toISOString() };
    }, "intake")

    .add(async (input) => {
      console.log("[Workflow] Step 2: RAG Diagnosis");
      const { buildClinicalRAG } = await import("../langchain/clinicalRAG");
      const rag    = buildClinicalRAG();
      const ragResult = await rag.invoke(input.symptoms);
      return { ...input, ragDiagnosis: ragResult };
    }, "rag_diagnosis")

    .add(async (input) => {
      console.log("[Workflow] Step 3: Iterative Triage Graph");
      const { runTriageGraph } = await import("../langgraph/triageGraph");
      const triage = await runTriageGraph(input.symptoms);
      return { ...input, triage };
    }, "triage_graph")

    .add(async (input) => {
      console.log("[Workflow] Step 4: Specialist Council");
      const { runSpecialistCouncil } = await import("../crew/specialistCouncil");
      const caseStr = `Symptoms: ${input.symptoms}. Triage risk: ${input.triage?.riskScore}. Disposition: ${input.triage?.disposition}.`;
      const council = await runSpecialistCouncil(caseStr);
      return { ...input, council };
    }, "specialist_council");
}
