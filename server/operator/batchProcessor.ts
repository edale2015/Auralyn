type JobStatus = "queued" | "running" | "completed" | "failed" | "paused" | "approved" | "rejected";

type Job = {
  id: string;
  program: string;
  userData: Record<string, any>;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  steps: Array<{
    id: number;
    action: string;
    description: string;
    status: "pending" | "running" | "completed" | "failed" | "needs_approval";
    result?: string;
  }>;
  result?: any;
  error?: string;
};

let jobs: Map<string, Job> = new Map();
let jobCounter = 0;

export class BatchProcessor {
  createJob(program: string, userData: Record<string, any>, steps: any[]): Job {
    const id = `job_${++jobCounter}_${Date.now()}`;
    const job: Job = {
      id,
      program,
      userData,
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: steps.map(s => ({
        id: s.id,
        action: s.action,
        description: s.description,
        status: s.requiresApproval ? "needs_approval" : "pending"
      }))
    };

    jobs.set(id, job);
    return job;
  }

  createBatch(items: Array<{ program: string; userData: Record<string, any>; steps: any[] }>): Job[] {
    return items.map(item => this.createJob(item.program, item.userData, item.steps));
  }

  simulateExecution(jobId: string): Job {
    const job = jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    job.status = "running";
    job.updatedAt = new Date().toISOString();

    let allApproved = true;
    for (const step of job.steps) {
      if (step.status === "needs_approval") {
        allApproved = false;
        job.status = "paused";
        break;
      }
      step.status = "completed";
      step.result = `${step.action} executed successfully`;
    }

    if (allApproved) {
      job.status = "completed";
      job.result = {
        program: job.program,
        submittedAt: new Date().toISOString(),
        confirmationId: `CONF-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
      };
    }

    job.updatedAt = new Date().toISOString();
    return job;
  }

  approveStep(jobId: string, stepId: number): Job {
    const job = jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const step = job.steps.find(s => s.id === stepId);
    if (step) {
      step.status = "completed";
      step.result = "Approved by human reviewer";
    }

    const pendingApprovals = job.steps.filter(s => s.status === "needs_approval");
    if (pendingApprovals.length === 0) {
      for (const s of job.steps) {
        if (s.status === "pending") s.status = "completed";
      }
      job.status = "completed";
      job.result = {
        program: job.program,
        submittedAt: new Date().toISOString(),
        confirmationId: `CONF-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
      };
    }

    job.updatedAt = new Date().toISOString();
    return job;
  }

  rejectStep(jobId: string, stepId: number, reason: string): Job {
    const job = jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const step = job.steps.find(s => s.id === stepId);
    if (step) {
      step.status = "failed";
      step.result = `Rejected: ${reason}`;
    }

    job.status = "failed";
    job.error = `Step ${stepId} rejected: ${reason}`;
    job.updatedAt = new Date().toISOString();
    return job;
  }

  getJob(jobId: string): Job | undefined {
    return jobs.get(jobId);
  }

  getAllJobs(): Job[] {
    return Array.from(jobs.values()).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getStats() {
    const allJobs = this.getAllJobs();
    return {
      total: allJobs.length,
      queued: allJobs.filter(j => j.status === "queued").length,
      running: allJobs.filter(j => j.status === "running").length,
      paused: allJobs.filter(j => j.status === "paused").length,
      completed: allJobs.filter(j => j.status === "completed").length,
      failed: allJobs.filter(j => j.status === "failed").length,
      successRate: allJobs.length > 0
        ? allJobs.filter(j => j.status === "completed").length / allJobs.length
        : 0
    };
  }

  clearCompleted() {
    for (const [id, job] of jobs.entries()) {
      if (job.status === "completed" || job.status === "failed") {
        jobs.delete(id);
      }
    }
  }
}

export const batchProcessor = new BatchProcessor();
