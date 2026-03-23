import { useEffect, useState } from "react";

type Pose = {
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
};

type CommandResult = {
  ok: boolean;
  rejected?: boolean;
  reason?: string;
  message?: string;
};

const DEFAULT_SAFETY = {
  estopActive: false,
  humanPresent: true,
  clinicianApproved: true,
  collisionRisk: "LOW" as const,
  withinSafeZone: true,
};

export default function RoboticsControlPage() {
  const [pose, setPose] = useState<Pose | null>(null);
  const [lastResult, setLastResult] = useState<CommandResult | null>(null);
  const [estopped, setEstopped] = useState(false);
  const [jogAmount, setJogAmount] = useState(5);

  useEffect(() => {
    refreshPose();
  }, []);

  async function refreshPose() {
    const res = await fetch("/api/robotics/pose");
    const data = await res.json();
    setPose(data.pose);
  }

  async function sendCommand(type: string, extra: Record<string, any> = {}) {
    const res = await fetch("/api/robotics/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: { type, issuedBy: "clinician", ...extra },
        safety: { ...DEFAULT_SAFETY, estopActive: estopped },
      }),
    });
    const data = await res.json();
    setLastResult(data);
    if (data.pose) setPose(data.pose);
  }

  async function jog(axis: "x" | "y" | "z", sign: number) {
    await sendCommand("jog", { delta: { [axis]: jogAmount * sign } });
    refreshPose();
  }

  async function home() {
    await sendCommand("home");
    refreshPose();
  }

  async function estop() {
    setEstopped(true);
    await fetch("/api/robotics/estop", { method: "POST" });
    setLastResult({ ok: true, message: "E-STOP engaged. All motion halted." });
  }

  function resumeFromEstop() {
    setEstopped(false);
    setLastResult({ ok: true, message: "E-STOP cleared. System ready." });
  }

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Robotic Assist Control</h1>
        <div className="flex items-center gap-3">
          <span className={`text-sm px-3 py-1 rounded-full ${estopped ? "bg-red-100 text-red-700 font-semibold" : "bg-green-100 text-green-700"}`}>
            {estopped ? "E-STOPPED" : "Operational"}
          </span>
          <button
            data-testid="button-refresh-pose"
            className="px-3 py-2 text-sm border rounded-xl"
            onClick={refreshPose}
          >
            Refresh Pose
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-2xl shadow p-4">
          <h2 className="font-semibold mb-3">Current Pose</h2>
          {pose ? (
            <div className="grid grid-cols-3 gap-2">
              {(["x","y","z","rx","ry","rz"] as const).map(axis => (
                <div key={axis} className="bg-slate-50 rounded-lg p-2 text-center">
                  <div className="text-xs text-slate-500 uppercase">{axis}</div>
                  <div data-testid={`pose-${axis}`} className="font-mono font-semibold text-sm">
                    {pose[axis].toFixed(1)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-slate-400 text-sm">Loading pose...</div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow p-4">
          <h2 className="font-semibold mb-3">Manual Jog</h2>
          <div className="mb-3">
            <label className="text-xs text-slate-500">Jog step (mm)</label>
            <input
              data-testid="input-jog-amount"
              type="number"
              min={1} max={50}
              className="w-full border rounded-lg p-1.5 text-sm mt-1"
              value={jogAmount}
              onChange={e => setJogAmount(Number(e.target.value))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["x","y","z"] as const).map(axis => (
              <div key={axis} className="contents">
                <button
                  data-testid={`button-jog-${axis}-minus`}
                  className="border rounded-xl p-2 text-sm hover:bg-slate-50"
                  onClick={() => jog(axis, -1)}
                  disabled={estopped}
                >
                  {axis.toUpperCase()} −
                </button>
                <button
                  data-testid={`button-jog-${axis}-plus`}
                  className="border rounded-xl p-2 text-sm hover:bg-slate-50"
                  onClick={() => jog(axis, 1)}
                  disabled={estopped}
                >
                  {axis.toUpperCase()} +
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              data-testid="button-safe-home"
              className="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm flex-1"
              onClick={home}
              disabled={estopped}
            >
              Safe Home
            </button>
            {!estopped ? (
              <button
                data-testid="button-estop"
                className="bg-red-600 text-white rounded-xl px-4 py-2 text-sm flex-1"
                onClick={estop}
              >
                E-STOP
              </button>
            ) : (
              <button
                data-testid="button-resume"
                className="bg-amber-500 text-white rounded-xl px-4 py-2 text-sm flex-1"
                onClick={resumeFromEstop}
              >
                Clear E-STOP
              </button>
            )}
          </div>
        </div>
      </div>

      {lastResult && (
        <div className={`bg-white rounded-2xl shadow p-4 ${
          lastResult.ok ? "border-l-4 border-green-500" : "border-l-4 border-red-500"
        }`}>
          <div className="font-semibold text-sm mb-1">Last Command Result</div>
          <div className="text-sm text-slate-600">
            {lastResult.rejected
              ? `Rejected: ${lastResult.reason}`
              : lastResult.message || (lastResult.ok ? "Success" : "Failed")}
          </div>
        </div>
      )}

      <div className="mt-4 bg-white rounded-2xl shadow p-4">
        <h2 className="font-semibold mb-2">Device Info</h2>
        <div className="text-sm text-slate-500 space-y-1">
          <div>Adapter: MockRobotAdapter (dev mode)</div>
          <div>Safe zone: x ±200mm, y ±200mm, z 0–300mm</div>
          <div>Max velocity: 40 mm/s | Max angular: 20 deg/s</div>
        </div>
      </div>
    </div>
  );
}
