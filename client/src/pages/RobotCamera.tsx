import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Target, Eye, RefreshCw, Wifi, WifiOff, CheckCircle2, AlertTriangle } from "lucide-react";

type Tool = "otoscope" | "ekg_camera" | "oral_camera" | "stethoscope";

const TOOL_LABELS: Record<Tool, string> = {
  otoscope: "Otoscope",
  ekg_camera: "EKG Camera",
  oral_camera: "Oral Camera",
  stethoscope: "Stethoscope",
};

const BOX_COLORS: Record<string, string> = {
  green: "border-green-400 bg-green-400/10",
  yellow: "border-yellow-400 bg-yellow-400/10",
  red: "border-red-400 bg-red-400/10",
};

export default function RobotCamera() {
  const [tool, setTool] = useState<Tool>("otoscope");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["/api/robotics/camera", tool],
    queryFn: async () => {
      const res = await fetch(`/api/robotics/camera?tool=${tool}`);
      return res.json();
    },
    refetchInterval: autoRefresh ? 2000 : false,
  });

  const overlay = data?.overlay;
  const frameAge = dataUpdatedAt ? Math.round((Date.now() - dataUpdatedAt) / 1000) : null;

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
            <Camera className="w-5 h-5 text-teal-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Robot Vision</h1>
            <p className="text-sm text-gray-500">Camera feed with real-time overlay guidance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => setAutoRefresh(v => !v)}
            className={autoRefresh ? "border-teal-500 text-teal-700" : ""}
            data-testid="button-toggle-autorefresh"
          >
            {autoRefresh ? <Wifi className="w-4 h-4 mr-2 text-teal-600" /> : <WifiOff className="w-4 h-4 mr-2" />}
            {autoRefresh ? "Live" : "Manual"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}
            data-testid="button-refresh-camera">
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <Card data-testid="card-camera-feed">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Camera className="w-4 h-4 text-teal-600" /> Live Feed
                </CardTitle>
                {frameAge !== null && (
                  <span className="text-xs text-gray-400">{frameAge}s ago</span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative bg-gray-900 rounded-xl overflow-hidden" style={{ aspectRatio: "4/3" }}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <Camera className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Live camera feed</p>
                    <p className="text-xs mt-1 opacity-60">Connect hardware source to stream frames</p>
                  </div>
                </div>

                {overlay && (
                  <div
                    className={`absolute border-2 rounded ${BOX_COLORS[overlay.color] ?? BOX_COLORS.green} transition-all duration-300`}
                    style={{
                      left: `${(overlay.box[0] / 640) * 100}%`,
                      top: `${(overlay.box[1] / 480) * 100}%`,
                      width: `${(overlay.box[2] / 640) * 100}%`,
                      height: `${(overlay.box[3] / 480) * 100}%`,
                    }}
                    data-testid="overlay-box"
                  >
                    <span className={`absolute -top-5 left-0 text-xs px-1.5 py-0.5 rounded font-medium ${
                      overlay.color === "green" ? "bg-green-500 text-white"
                      : overlay.color === "yellow" ? "bg-yellow-500 text-black"
                      : "bg-red-500 text-white"
                    }`}>
                      {overlay.target} {Math.round(overlay.confidence * 100)}%
                    </span>
                  </div>
                )}

                {autoRefresh && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-teal-600 text-white text-xs px-2 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    LIVE
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {overlay?.instructions?.length > 0 && (
            <Card data-testid="card-instructions">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Procedural Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2">
                  {overlay.instructions.map((instr: string, i: number) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      {instr}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card data-testid="card-tool-control">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-600" /> Tool Selection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={tool} onValueChange={v => setTool(v as Tool)}>
                <SelectTrigger data-testid="select-camera-tool">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TOOL_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {overlay && (
            <Card data-testid="card-overlay-stats">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-600" /> Overlay Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Target</span>
                  <span className="text-sm font-semibold" data-testid="text-camera-target">
                    {overlay.target}
                  </span>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">Confidence</span>
                    <span className="font-medium" data-testid="text-camera-confidence">
                      {Math.round(overlay.confidence * 100)}%
                    </span>
                  </div>
                  <Progress value={Math.round(overlay.confidence * 100)} className="h-2" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Safe to Advance</span>
                  {overlay.safeToAdvance ? (
                    <div className="flex items-center gap-1 text-green-700 text-xs font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Yes
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-red-700 text-xs font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" /> No
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Signal</span>
                  <Badge
                    className={`text-xs ${overlay.color === "green" ? "bg-green-100 text-green-800" : overlay.color === "yellow" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}
                    data-testid="badge-overlay-color"
                  >
                    {overlay.color.toUpperCase()}
                  </Badge>
                </div>
                <div className="text-xs text-gray-400 border-t pt-2">
                  Box: [{overlay.box.join(", ")}]
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
