type CallStatus = "connected" | "queued" | "completed" | "failed";

type ActiveCall = {
  id: string;
  startTime: string;
  complaint: string;
  status: CallStatus;
  history: Array<{ role: string; text: string }>;
};

const MAX_CONCURRENT_CALLS = 500;
let activeCalls: Map<string, ActiveCall> = new Map();
let callStats = {
  totalCalls: 0,
  completedCalls: 0,
  avgDuration: 0,
  peakConcurrent: 0
};

export function routeCall(callId: string, complaint: string): { status: CallStatus; message: string; callId: string } {
  if (activeCalls.size >= MAX_CONCURRENT_CALLS) {
    return { status: "queued", message: "All agents busy. You are in queue.", callId };
  }

  activeCalls.set(callId, {
    id: callId,
    startTime: new Date().toISOString(),
    complaint,
    status: "connected",
    history: []
  });

  callStats.totalCalls++;
  if (activeCalls.size > callStats.peakConcurrent) {
    callStats.peakConcurrent = activeCalls.size;
  }

  return { status: "connected", message: "Connected to AI triage agent.", callId };
}

export function handleConversation(callId: string, text: string): { response: string; continue: boolean } {
  const call = activeCalls.get(callId);

  if (!call) {
    return { response: "Call not found. Please reconnect.", continue: false };
  }

  call.history.push({ role: "patient", text });

  let response: string;
  let shouldContinue = true;

  const historyLength = call.history.filter(h => h.role === "patient").length;

  if (historyLength === 1) {
    if (text.toLowerCase().includes("pain")) {
      response = "I understand you're experiencing pain. Can you rate it from 1 to 10?";
    } else if (text.toLowerCase().includes("fever")) {
      response = "I see you have a fever. How high is your temperature, and when did it start?";
    } else if (text.toLowerCase().includes("cough")) {
      response = "Tell me about your cough. Is it dry or productive? How long have you had it?";
    } else {
      response = "Thank you for calling. Can you describe your main symptoms?";
    }
  } else if (historyLength === 2) {
    response = "How long have you been experiencing these symptoms?";
  } else if (historyLength === 3) {
    response = "Are you currently taking any medications?";
  } else if (historyLength === 4) {
    response = "Do you have any allergies or pre-existing conditions I should know about?";
  } else {
    response = "Thank you for the information. Based on what you've told me, I'm generating a care recommendation. A physician will review and get back to you shortly.";
    shouldContinue = false;
  }

  call.history.push({ role: "agent", text: response });

  if (!shouldContinue) {
    call.status = "completed";
  }

  return { response, continue: shouldContinue };
}

export function endCall(callId: string): { success: boolean } {
  const call = activeCalls.get(callId);
  if (!call) return { success: false };

  call.status = "completed";
  callStats.completedCalls++;

  const start = new Date(call.startTime).getTime();
  const duration = (Date.now() - start) / 1000;
  callStats.avgDuration = (callStats.avgDuration * (callStats.completedCalls - 1) + duration) / callStats.completedCalls;

  activeCalls.delete(callId);
  return { success: true };
}

export function getCallCenterStats() {
  return {
    activeCalls: activeCalls.size,
    maxCapacity: MAX_CONCURRENT_CALLS,
    utilization: activeCalls.size / MAX_CONCURRENT_CALLS,
    ...callStats,
    activeCallDetails: Array.from(activeCalls.values()).map(c => ({
      id: c.id,
      complaint: c.complaint,
      status: c.status,
      startTime: c.startTime,
      messageCount: c.history.length
    }))
  };
}
