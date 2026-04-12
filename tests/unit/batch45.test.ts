import { describe, it, expect, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Clinical Task Board (TodoWrite)
// ─────────────────────────────────────────────────────────────────────────────
import {
  writePlan, formatBoard, claimNextTask, updateTask,
  boardProgress, addTask, getBoard,
} from "../../server/agents/clinicalTaskBoard";

describe("Batch45 — clinicalTaskBoard: writePlan", () => {
  const BOARD = "patient-b45-001";

  it("creates a board with ordered tasks", () => {
    const { board, summary } = writePlan(BOARD, "Triage: Chest Pain", [
      { description: "Collect vitals",        priority: "high" },
      { description: "Run NEWS2 scoring",     priority: "high" },
      { description: "Sepsis screening",      priority: "medium" },
      { description: "Determine disposition", priority: "medium" },
    ]);
    expect(board.tasks).toHaveLength(4);
    expect(board.tasks[0].status).toBe("pending");
    expect(summary).toContain("Triage: Chest Pain");
    expect(summary).toContain("Collect vitals");
  });

  it("formats a board with status icons", () => {
    const { board } = writePlan(BOARD, "Test", [{ description: "Step A" }]);
    const fmt = formatBoard(board);
    expect(fmt).toContain("○");   // pending icon
    expect(fmt).toContain("Step A");
  });

  it("resets board on repeated writePlan for same boardId", () => {
    writePlan(BOARD, "First plan", [{ description: "Task 1" }]);
    const { board } = writePlan(BOARD, "Second plan", [{ description: "Task 2" }, { description: "Task 3" }]);
    expect(board.tasks).toHaveLength(2);
    expect(board.tasks[0].description).toBe("Task 2");
  });
});

describe("Batch45 — clinicalTaskBoard: claimNextTask + updateTask", () => {
  const BOARD = "patient-b45-002";

  beforeEach(() => {
    writePlan(BOARD, "Triage", [
      { description: "Step A", priority: "high" },
      { description: "Step B", priority: "medium", dependsOn: [] },
    ]);
  });

  it("claimNextTask returns highest priority unblocked task", () => {
    const task = claimNextTask(BOARD, "agent-001");
    expect(task).not.toBeNull();
    expect(task!.description).toBe("Step A");
    expect(task!.status).toBe("in_progress");
    expect(task!.claimedBy).toBe("agent-001");
  });

  it("updateTask to done updates status and result", () => {
    const t = claimNextTask(BOARD, "agent-001")!;
    const updated = updateTask(BOARD, t.id, "done", "Vitals collected: HR 95 BP 130/80");
    expect(updated!.status).toBe("done");
    expect(updated!.result).toContain("HR 95");
  });

  it("dependency enforcement: step B not claimed before step A is done", () => {
    writePlan("dep-board", "Deps", [
      { description: "A", priority: "high" },
      { description: "B", priority: "high", dependsOn: ["placeholder-id"] },
    ]);
    // Can't claim B since its dep is a placeholder not yet done
    const b45Board = getBoard("dep-board")!;
    const bTask = b45Board.tasks[1];
    bTask.dependsOn = [b45Board.tasks[0].id];  // wire dep correctly

    // A is still pending — B should be blocked
    const claimed = claimNextTask("dep-board", "agent-001");
    expect(claimed!.description).toBe("A");  // A is claimed, not B
    const claimed2 = claimNextTask("dep-board", "agent-001");
    expect(claimed2).toBeNull();              // B is blocked (A not done yet)
  });

  it("boardProgress tracks completion percentage", () => {
    const t1 = claimNextTask(BOARD, "agent-001")!;
    updateTask(BOARD, t1.id, "done");
    const t2 = claimNextTask(BOARD, "agent-001")!;
    updateTask(BOARD, t2.id, "done");
    const prog = boardProgress(BOARD)!;
    expect(prog.done).toBe(2);
    expect(prog.pctDone).toBe(100);
  });

  it("addTask adds dynamic tasks to existing board", () => {
    const task = addTask(BOARD, "Dynamic: recheck labs", { priority: "high" });
    expect(task).not.toBeNull();
    const board = getBoard(BOARD)!;
    expect(board.tasks.some((t) => t.description.includes("recheck labs"))).toBe(true);
  });

  it("formatBoard shows ✓ for done tasks", () => {
    const t = claimNextTask(BOARD, "agent-001")!;
    updateTask(BOARD, t.id, "done", "completed");
    const board = getBoard(BOARD)!;
    const fmt = formatBoard(board);
    expect(fmt).toContain("✓");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. FSM Agent Protocol
// ─────────────────────────────────────────────────────────────────────────────
import {
  registerAgent, protocolSend, protocolReceive, protocolComplete,
  protocolUnblock, getAgentState, AgentState, formatStateLog,
} from "../../server/agents/agentProtocol";

describe("Batch45 — agentProtocol: FSM states", () => {
  it("starts in IDLE state", () => {
    const a = registerAgent("cardiologist-b45");
    expect(a.state).toBe(AgentState.IDLE);
  });

  it("send transitions sender to WAITING", () => {
    const sender = registerAgent("sender-b45");
    const recip  = registerAgent("recipient-b45");
    const result = protocolSend(sender.id, recip.id, "Assess chest pain patient");
    expect(result.ok).toBe(true);
    expect(getAgentState(sender.id)).toBe(AgentState.WAITING);
  });

  it("WAITING agent cannot send (deadlock prevention)", () => {
    const a = registerAgent("alpha-b45");
    const b = registerAgent("beta-b45");
    const c = registerAgent("gamma-b45");
    protocolSend(a.id, b.id, "First request");
    // a is now WAITING
    const blocked = protocolSend(a.id, c.id, "Second request while waiting");
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toContain("WAITING");
  });

  it("receive transitions recipient to RESPONDING", () => {
    const src = registerAgent("src-b45");
    const dst = registerAgent("dst-b45");
    protocolSend(src.id, dst.id, "Clinical query");
    const msg = protocolReceive(dst.id);
    expect(msg).not.toBeNull();
    expect(msg!.body).toBe("Clinical query");
    expect(getAgentState(dst.id)).toBe(AgentState.RESPONDING);
  });

  it("complete returns agent to IDLE", () => {
    const src = registerAgent("src2-b45");
    const dst = registerAgent("dst2-b45");
    protocolSend(src.id, dst.id, "Query");
    protocolReceive(dst.id);
    protocolComplete(dst.id);
    expect(getAgentState(dst.id)).toBe(AgentState.IDLE);
  });

  it("unblock releases WAITING sender", () => {
    const a = registerAgent("a2-b45");
    const b = registerAgent("b2-b45");
    protocolSend(a.id, b.id, "Message");
    expect(getAgentState(a.id)).toBe(AgentState.WAITING);
    protocolUnblock(a.id);
    expect(getAgentState(a.id)).toBe(AgentState.IDLE);
  });

  it("formatStateLog produces readable trace", () => {
    const log = formatStateLog(5);
    expect(typeof log).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Session Persistence
// ─────────────────────────────────────────────────────────────────────────────
import {
  newSession, saveSession, loadSession, listSessions,
  forkSession, deleteSession, appendMessage, sessionSummary,
} from "../../server/session/agentSession";

describe("Batch45 — agentSession: create / save / load", () => {
  it("creates a session with a unique ID", () => {
    const s = newSession("Chest Pain Triage", "patient-001");
    expect(s.id).toBeTruthy();
    expect(s.title).toBe("Chest Pain Triage");
    expect(s.patientId).toBe("patient-001");
    expect(s.messages).toHaveLength(0);
  });

  it("loadSession returns saved state", () => {
    const s = newSession("Test Session", "p-002");
    appendMessage(s, "user", "What is the NEWS2 score?");
    saveSession(s);
    const loaded = loadSession(s.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.messages).toHaveLength(1);
    expect(loaded!.messages[0].content).toBe("What is the NEWS2 score?");
  });

  it("listSessions returns most recent first", () => {
    newSession("Session A", "p-003");
    newSession("Session B", "p-003");
    const list = listSessions("p-003");
    expect(list.length).toBeGreaterThanOrEqual(2);
    // Most recently updated first
    expect(list[0].updatedAt >= list[1].updatedAt).toBe(true);
  });

  it("forkSession creates independent copy", () => {
    const original = newSession("Original Triage", "p-004");
    appendMessage(original, "user", "Assume sepsis");
    saveSession(original);

    const fork = forkSession(original.id, "Fork: UTI hypothesis");
    expect(fork).not.toBeNull();
    expect(fork!.forkedFrom).toBe(original.id);
    expect(fork!.messages).toHaveLength(1);

    // Modify fork — original unaffected
    appendMessage(fork!, "assistant", "UTI treatment initiated");
    saveSession(fork!);

    const reloadedOriginal = loadSession(original.id)!;
    expect(reloadedOriginal.messages).toHaveLength(1);  // unchanged
  });

  it("deleteSession removes session", () => {
    const s = newSession("Temp", "p-005");
    const deleted = deleteSession(s.id);
    expect(deleted).toBe(true);
    expect(loadSession(s.id)).toBeNull();
  });

  it("sessionSummary includes title and message count", () => {
    const s = newSession("Sepsis Check", "p-006");
    appendMessage(s, "user", "Check vitals");
    saveSession(s);
    const summary = sessionSummary(s);
    expect(summary).toContain("Sepsis Check");
    expect(summary).toContain("p-006");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Background Task Queue
// ─────────────────────────────────────────────────────────────────────────────
import {
  dispatch, drainNotifications, formatNotification,
  getTask, awaitTask, awaitAll,
} from "../../server/agents/backgroundQueue";

describe("Batch45 — backgroundQueue: dispatch + notify", () => {
  it("dispatch returns immediately with queued task", () => {
    const task = dispatch("test-immediate", async () => "result");
    expect(task.id).toBeTruthy();
    expect(task.label).toBe("test-immediate");
    expect(["queued", "running"]).toContain(task.status);
  });

  it("awaitTask completes and returns result", async () => {
    const task = dispatch("test-complete", async () => ({ sepsis: false, score: 2 }));
    const done = await awaitTask(task.id);
    expect(done.status).toBe("completed");
    expect((done.result as any).score).toBe(2);
  });

  it("drainNotifications returns completed task notification", async () => {
    dispatch("test-notify", async () => "done");
    await new Promise((r) => setTimeout(r, 50));
    const notifications = drainNotifications();
    const n = notifications.find((n) => n.label === "test-notify");
    expect(n).toBeDefined();
    expect(n!.status).toBe("completed");
  });

  it("failed task posts failure notification", async () => {
    const task = dispatch("test-fail", async () => { throw new Error("Lab timeout"); }, { timeoutMs: 5000 });
    await awaitTask(task.id, 10, 5000);
    expect(getTask(task.id)!.status).toBe("failed");
    const notifications = drainNotifications();
    const n = notifications.find((x) => x.taskId === task.id);
    expect(n?.status).toBe("failed");
    expect(n?.error).toContain("Lab timeout");
  });

  it("formatNotification produces readable string", () => {
    const formatted = formatNotification({
      taskId: "t1", label: "sepsis-detection", status: "completed",
      result: { risk: "high" }, durationMs: 1500, timestamp: new Date().toISOString(),
    });
    expect(formatted).toContain("COMPLETED");
    expect(formatted).toContain("sepsis-detection");
  });

  it("awaitAll waits for multiple tasks", async () => {
    const t1 = dispatch("bg-a", async () => 1);
    const t2 = dispatch("bg-b", async () => 2);
    const results = await awaitAll([t1.id, t2.id]);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "completed")).toBe(true);
  });

  it("drainNotifications clears queue after drain", async () => {
    dispatch("drain-test", async () => "x");
    await new Promise((r) => setTimeout(r, 50));
    drainNotifications();  // first drain
    const second = drainNotifications();  // should be empty
    expect(second.filter((n) => n.label === "drain-test")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Prompt KV-Cache
// ─────────────────────────────────────────────────────────────────────────────
import {
  createCachedPrompt, addStableBlock, addVariableBlock,
  toMessages, recordUsage, getCacheStats, formatCacheStats,
  buildClinicalSystemPrompt,
} from "../../server/ai/promptCache";

describe("Batch45 — promptCache: builder + stats", () => {
  it("stable blocks appear before variable blocks in messages", () => {
    const p = createCachedPrompt("sess-001");
    addStableBlock(p, "Guidelines", "NEWS2 scoring: RR 3-4=1pt RR>24=3pt");
    addVariableBlock(p, "Patient", "John Doe, 65M, RR=22, HR=110");
    const msgs = toMessages(p);
    expect(msgs[0].role).toBe("system");    // stable
    expect(msgs[1].role).toBe("user");      // variable
    expect(msgs[0].content).toContain("Guidelines");
    expect(msgs[1].content).toContain("John Doe");
  });

  it("recordUsage tracks miss on first call", () => {
    const p = createCachedPrompt("sess-002");
    addStableBlock(p, "Rules", "Always flag NEWS2 >= 5");
    recordUsage(p, false);
    const stats = getCacheStats("sess-002")!;
    expect(stats.calls).toBe(1);
    expect(stats.missCount).toBe(1);
    expect(stats.hitCount).toBe(0);
  });

  it("recordUsage accumulates hits and savings", () => {
    const p = createCachedPrompt("sess-003");
    addStableBlock(p, "Rules", "A".repeat(4000));  // 1000 est tokens
    recordUsage(p, false);  // miss
    recordUsage(p, true);   // hit
    recordUsage(p, true);   // hit
    const stats = getCacheStats("sess-003")!;
    expect(stats.hitCount).toBe(2);
    expect(stats.totalSaved).toBeGreaterThan(0);
  });

  it("buildClinicalSystemPrompt includes stable operating rules", () => {
    const p = buildClinicalSystemPrompt({
      sessionId: "sess-004",
      guidelines: "Sepsis bundle: blood cultures within 1h",
      patientData: "Alice, 72F, temp 39.1, HR 118",
    });
    const msgs = toMessages(p);
    const systemMsg = msgs.find((m) => m.role === "system")!;
    expect(systemMsg.content).toContain("HIPAA");
    expect(systemMsg.content).toContain("Sepsis bundle");
    const userMsg = msgs.find((m) => m.role === "user")!;
    expect(userMsg.content).toContain("Alice");
  });

  it("formatCacheStats produces readable output", () => {
    const p = createCachedPrompt("sess-005");
    addStableBlock(p, "Stable", "Rules here");
    recordUsage(p, false);
    recordUsage(p, true);
    const fmt = formatCacheStats("sess-005");
    expect(fmt).toContain("Hits:");
    expect(fmt).toContain("calls");
  });

  it("prompt without variable blocks has only system message", () => {
    const p = createCachedPrompt("sess-006");
    addStableBlock(p, "Static", "Only stable content");
    const msgs = toMessages(p);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("system");
  });
});
