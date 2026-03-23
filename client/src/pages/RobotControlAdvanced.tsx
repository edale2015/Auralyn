import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Cpu, Eye, AlertTriangle, Target, ChevronUp, ChevronDown,
  ChevronLeft, ChevronRight, Plus, Minus, Home, StopCircle, RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Tool = "otoscope" | "ekg_camera" | "oral_camera" | "stethoscope";

const SAFETY_DEFAULT = {
  estopActive: false,
  humanPresent: true,
  clinicianApproved: true,
  collisionRisk: "LOW" as const,
  withinSafeZone: true,
};

export default function RobotControlAdvanced() {
  const { toast } = useToast();
  const [tool, setTool] = useState<Tool>("otoscope");
  const [overlay, setOverlay] = useState<any>(null);
  const [jogStep, setJogStep] = useState(5);

  const { data: poseData, refetch: refetchPose } = useQuery({
    queryKey: ["/api/robotics/pose"],
    refetchInterval: 3000,
  });

  const pose = (poseData as any)?.pose;

  async function jog(axis: "x" | "y" | "z", delta: number) {
    await apiRequest("POST", "/api/robotics/command", {
      command: { type: "jog", delta: { [axis]: delta }, issuedBy: "physician" },
      safety: SAFETY_DEFAULT,
    });
    refetchPose();
  }

  async function home() {
    await apiRequest("POST", "/api/robotics/command", {
      command: { type: "home", issuedBy: "physician" },
      safety: SAFETY_DEFAULT,
    });
    refetchPose();
    toast({ title: "Returned to home position" });
  }

  async function estop() {
    await apiRequest("POST", "/api/robotics/estop", {});
    toast({ title: "E-STOP sent", variant: "destructive" });
  }

  const overlayMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/physician/vision-overlay", {
        tool,
        currentPose: pose ?? { x: 0, y: 0, z: 0 },
      }),
    onSuccess: (data: any) => setOverlay(data.guidance),
    onError: () => toast({ title: "Vision overlay failed", variant: "destructive" }),
  });

  const alignMutation = useMutation({
    mutationFn: async () => {
      if (!overlay?.boundingBox || !pose) return;
      const res = await apiRequest("POST", "/api/autonomous/vision/alignment", { tool, pose });
      return res;
    },
    onSuccess: async (data: any) => {
      if (!data?.result?.aligned && data?.result?.correction) {
        const { dx, dy, dz } = data.result.correction;
        if (Math.abs(dx) > 0.5) await jog("x", dx);
        if (Math.abs(dy) > 0.5) await jog("y", dy);
        if (Math.abs(dz) > 0.5) await jog("z", dz);
        toast({ title: "Auto-alignment applied" });
      } else {
        toast({ title: "Already aligned" });
      }
    },
  });

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Advanced Robot Control</h1>
            <p className="text-sm text-gray-500">Vision overlay + auto-alignment + full jog control</p>
          </div>
        </div>
        <Button variant="destructive" size="sm" onClick={estop} data-testid="button-estop">
          <StopCircle className="w-4 h-4 mr-2" /> E-STOP
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card data-testid="card-pose">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-600" /> Current Pose
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pose ? (
              Object.entries(pose).map(([axis, val]) => (
                <div key={axis} className="flex justify-between text-sm">
                  <span className="text-gray-500 uppercase font-mono">{axis}</span>
                  <span className="font-bold font-mono" data-testid={`pose-${axis}`}>{String(val)}</span>
                </div>
              ))
            ) : (
              <div className="text-gray-400 text-sm">Loading…</div>
            )}
            <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => refetchPose()}
              data-testid="button-refresh-pose">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
          </CardContent>
        </Card>

        <Card data-testid="card-jog-controls">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Manual Jog</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              Step:
              {[1, 5, 10].map(s => (
                <button key={s} onClick={() => setJogStep(s)}
                  className={`px-2 py-0.5 rounded border text-xs font-medium transition-colors ${jogStep === s ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300"}`}
                  data-testid={`button-step-${s}`}>
                  {s}mm
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-xs font-medium">
              <button onClick={() => jog("x", -jogStep)} className="border rounded-lg p-2 hover:bg-gray-50 flex items-center justify-center gap-1" data-testid="jog-x-minus">
                <ChevronLeft className="w-3.5 h-3.5" /> X-
              </button>
              <button onClick={() => jog("z", jogStep)} className="border rounded-lg p-2 hover:bg-gray-50 flex items-center justify-center gap-1" data-testid="jog-z-plus">
                <ChevronUp className="w-3.5 h-3.5" /> Z+
              </button>
              <button onClick={() => jog("x", jogStep)} className="border rounded-lg p-2 hover:bg-gray-50 flex items-center justify-center gap-1" data-testid="jog-x-plus">
                X+ <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => jog("y", -jogStep)} className="border rounded-lg p-2 hover:bg-gray-50 flex items-center justify-center gap-1" data-testid="jog-y-minus">
                <Minus className="w-3.5 h-3.5" /> Y-
              </button>
              <button onClick={home} className="border rounded-lg p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center justify-center" data-testid="button-home">
                <Home className="w-4 h-4" />
              </button>
              <button onClick={() => jog("y", jogStep)} className="border rounded-lg p-2 hover:bg-gray-50 flex items-center justify-center gap-1" data-testid="jog-y-plus">
                Y+ <Plus className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => jog("z", -jogStep)} className="border rounded-lg p-2 hover:bg-gray-50 col-start-2 flex items-center justify-center gap-1" data-testid="jog-z-minus">
                <ChevronDown className="w-3.5 h-3.5" /> Z-
              </button>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-tool-select">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="w-4 h-4 text-teal-600" /> Vision Overlay
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={tool} onValueChange={v => setTool(v as Tool)}>
              <SelectTrigger data-testid="select-tool">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="otoscope">Otoscope</SelectItem>
                <SelectItem value="oral_camera">Oral Camera</SelectItem>
                <SelectItem value="ekg_camera">EKG Camera</SelectItem>
                <SelectItem value="stethoscope">Stethoscope</SelectItem>
              </SelectContent>
            </Select>

            <Button className="w-full" variant="outline" size="sm"
              onClick={() => overlayMutation.mutate()} disabled={overlayMutation.isPending}
              data-testid="button-get-overlay">
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              {overlayMutation.isPending ? "Analyzing…" : "Get Overlay Guidance"}
            </Button>

            <Button className="w-full" size="sm"
              onClick={() => alignMutation.mutate()} disabled={alignMutation.isPending || !pose}
              data-testid="button-auto-align">
              <Target className="w-3.5 h-3.5 mr-1.5" />
              {alignMutation.isPending ? "Aligning…" : "Auto-Align"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {overlay && (
        <Card data-testid="card-overlay-result">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Overlay Guidance — {overlay.tool}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <span className="text-xs text-gray-500">Target Region</span>
                <div className="font-medium text-sm" data-testid="text-target-region">{overlay.targetRegion}</div>
              </div>
              <div>
                <span className="text-xs text-gray-500">Safe to Advance</span>
                <div>
                  <Badge variant={overlay.safeToAdvance ? "outline" : "destructive"}
                    data-testid="badge-safe-advance">
                    {overlay.safeToAdvance ? "Yes" : "No"}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-500">Confidence</span>
                <div className="text-sm font-bold" data-testid="text-overlay-confidence">
                  {Math.round(overlay.confidence * 100)}%
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-500">Overlay Type</span>
                <div className="text-sm capitalize">{overlay.overlayType}</div>
              </div>
            </div>

            <Progress value={Math.round(overlay.confidence * 100)} className="h-2" />

            <Separator />

            <div>
              <div className="text-xs font-medium text-gray-600 mb-2">Instructions</div>
              <ol className="space-y-1">
                {overlay.instructions.map((instr: string, i: number) => (
                  <li key={i} className="text-sm text-gray-700 flex gap-2">
                    <span className="text-gray-400 shrink-0">{i + 1}.</span>
                    {instr}
                  </li>
                ))}
              </ol>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
