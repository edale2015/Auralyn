import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { Cpu, Eye, HeartPulse, Activity, Wifi, WifiOff, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RobotDevice { id: string; deviceId: string; type: string; status: string; lastSeen: string | null; }
interface RobotResult { id: string; deviceId: string; resultType: string; data: any; createdAt: string | null; }

const DEVICE_ICON: Record<string, any> = { otoscope: Eye, vitals: HeartPulse, ekg: Activity, camera: Eye };

export default function RobotExamPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newDeviceId, setNewDeviceId] = useState("cam1");
  const [newDeviceType, setNewDeviceType] = useState("otoscope");

  const { data: devices = [] } = useQuery<RobotDevice[]>({
    queryKey: ["/api/sysctrl/robot-devices"],
    refetchInterval: 5000,
  });
  const { data: results = [] } = useQuery<RobotResult[]>({
    queryKey: ["/api/sysctrl/robot-results"],
    refetchInterval: 5000,
  });

  const registerDevice = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sysctrl/robot-devices/register", { device_id: newDeviceId, type: newDeviceType }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/sysctrl/robot-devices"] }); toast({ title: "Device registered" }); },
  });

  const sendCmd = useMutation({
    mutationFn: ({ device_id, command }: { device_id: string; command: string }) =>
      apiRequest("POST", "/api/sysctrl/robot-command", { device_id, command }).then(r => r.json()),
    onSuccess: (_, v) => { toast({ title: `Command sent: ${v.command}` }); },
  });

  // Built-in quick actions
  const QUICK_CMDS = [
    { label: "Otoscope", device_id: "cam1", command: "capture_ear", icon: Eye },
    { label: "Vitals",   device_id: "vitals1", command: "measure",   icon: HeartPulse },
    { label: "EKG",      device_id: "ekg1",    command: "run",       icon: Activity },
  ];

  return (
    <div className="space-y-3" data-testid="robot-exam-panel">
      {/* Quick commands */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Quick Commands</p>
        <div className="grid grid-cols-3 gap-1.5">
          {QUICK_CMDS.map(c => {
            const Icon = c.icon;
            return (
              <Button
                key={c.command}
                size="sm"
                variant="outline"
                className="h-10 flex-col gap-0.5 text-xs py-1"
                onClick={() => sendCmd.mutate(c)}
                disabled={sendCmd.isPending}
                data-testid={`button-robot-${c.command}`}
              >
                <Icon className="h-4 w-4" />
                {c.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Register device */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Register Device</p>
        <div className="flex gap-1">
          <Input value={newDeviceId} onChange={e => setNewDeviceId(e.target.value)} placeholder="device_id" className="h-7 text-xs" data-testid="input-device-id" />
          <Input value={newDeviceType} onChange={e => setNewDeviceType(e.target.value)} placeholder="type" className="h-7 text-xs w-24" data-testid="input-device-type" />
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => registerDevice.mutate()} data-testid="button-register-device">
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Device list */}
      {devices.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Devices ({devices.length})</p>
          <div className="space-y-1">
            {devices.map((d, i) => {
              const Icon = DEVICE_ICON[d.type] ?? Cpu;
              return (
                <div key={d.id} className="flex items-center justify-between text-xs p-1.5 rounded border bg-card" data-testid={`device-row-${i}`}>
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium">{d.deviceId}</span>
                    <Badge variant="outline" className="text-xs py-0">{d.type}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    {d.status === "online"
                      ? <Wifi className="h-3 w-3 text-green-500" />
                      : <WifiOff className="h-3 w-3 text-gray-400" />}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1 text-xs"
                      onClick={() => sendCmd.mutate({ device_id: d.deviceId, command: "ping" })}
                    >
                      Ping
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent results */}
      {results.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Recent Results</p>
          <div className="space-y-1">
            {results.slice(0, 4).map((r, i) => (
              <div key={r.id} className="text-xs p-1.5 rounded border bg-card" data-testid={`result-row-${i}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.deviceId}</span>
                  <Badge variant="secondary" className="text-xs py-0">{r.resultType}</Badge>
                </div>
                {r.data && <p className="text-muted-foreground mt-0.5 truncate">{JSON.stringify(r.data).slice(0, 60)}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
