import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Building2,
  Clock,
  Database,
  MapPin,
  Navigation,
  Siren,
  Stethoscope,
  Zap,
} from "lucide-react";
import type { PatientRow } from "./MultiPatientGrid";
import { cn } from "@/lib/utils";

interface Hospital {
  id: string;
  name: string;
  lat: number;
  lon: number;
  services: string[];
  dist?: number;
}

interface EMSUnit {
  id: string;
  unit_name: string;
  lat: number;
  lon: number;
  status: string;
  eta?: number;
}

interface HospitalMatch {
  hospital: Hospital;
  neededService: string;
}

const SERVICES = ["any", "ICU", "cardiology", "trauma", "emergency", "neurology", "ENT", "pediatrics", "burns", "outpatient"];

function serviceLabel(s: string) {
  const map: Record<string, string> = {
    any: "Any Service", ICU: "ICU", cardiology: "Cardiology", trauma: "Trauma",
    emergency: "Emergency", neurology: "Neurology", ENT: "ENT", pediatrics: "Pediatrics",
    burns: "Burns Unit", outpatient: "Outpatient",
  };
  return map[s] ?? s;
}

interface Props {
  patient: PatientRow;
}

export default function HospitalRoutingPanel({ patient }: Props) {
  const { toast } = useToast();
  const [service, setService] = useState("emergency");
  const [match, setMatch] = useState<HospitalMatch | null>(null);

  // Patient default location (demo: San Francisco)
  const patientLat = 37.770;
  const patientLon = -122.425;

  const { data: emsData, isLoading: emsLoading } = useQuery<{ units: EMSUnit[] }>({
    queryKey: ["/api/command/ems-units"],
    queryFn: () => apiRequest("GET", "/api/command/ems-units").then(r => r.json()),
  });

  const seedMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/command/hospitals/seed").then(r => r.json()),
    onSuccess: d => {
      queryClient.invalidateQueries({ queryKey: ["/api/command/ems-units"] });
      toast({ title: "Demo Data Seeded", description: `${d.hospitals} hospitals + ${d.emsUnits} EMS units` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const routeMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/command/hospital-route", {
        lat: patientLat,
        lon: patientLon,
        service,
        patientId: patient.patient_id,
      }).then(r => r.json()),
    onSuccess: d => {
      if (d.hospital) {
        setMatch({ hospital: d.hospital, neededService: d.neededService });
      } else {
        toast({ title: "No Match", description: d.message ?? "No hospitals found for that service", variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Routing failed", description: e.message, variant: "destructive" }),
  });

  const availableEms = (emsData?.units ?? []).filter(u => u.status === "available");

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-blue-400" />
            <span className="text-sm font-semibold">Auto Hospital Selection</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => seedMut.mutate()}
            disabled={seedMut.isPending}
            className="text-[11px] h-6"
            data-testid="button-seed-hospital-data"
          >
            <Database size={10} className="mr-1" /> Seed Demo Data
          </Button>
        </div>

        {/* Service selector + route button */}
        <div className="flex gap-2">
          <Select value={service} onValueChange={setService}>
            <SelectTrigger className="text-xs h-8 flex-1" data-testid="select-service">
              <SelectValue placeholder="Select service" />
            </SelectTrigger>
            <SelectContent>
              {SERVICES.map(s => (
                <SelectItem key={s} value={s} className="text-xs">{serviceLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8"
            onClick={() => routeMut.mutate()}
            disabled={routeMut.isPending}
            data-testid="button-find-hospital"
          >
            <Navigation size={12} className="mr-1" />
            Find Hospital
          </Button>
        </div>

        {/* Patient location */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1.5">
          <MapPin size={11} className="text-blue-400" />
          Patient location: {patientLat.toFixed(3)}, {patientLon.toFixed(3)} (SF Demo)
        </div>

        {/* Matched hospital result */}
        {match && (
          <Card className="p-3 border-green-500/30 bg-green-500/5">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={13} className="text-green-400" />
              <span className="text-sm font-semibold text-green-400">Best Match</span>
              <Badge variant="outline" className="text-[10px] text-green-400 border-green-500/30 ml-auto">
                {serviceLabel(match.neededService)}
              </Badge>
            </div>
            <div className="font-bold text-base" data-testid="text-hospital-name">{match.hospital.name}</div>
            <div className="flex items-center gap-3 mt-2 text-sm">
              <div className="flex items-center gap-1 text-blue-400">
                <Navigation size={12} />
                <span className="font-semibold">{(match.hospital.dist ?? 0).toFixed(2)} km</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock size={12} />
                ~{Math.round(((match.hospital.dist ?? 0) / 40) * 60)} min drive
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {(match.hospital.services ?? []).map(s => (
                <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
              ))}
            </div>
          </Card>
        )}

        {/* EMS Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Siren size={13} className="text-red-400" />
            <span className="text-sm font-semibold">EMS Units</span>
            <Badge variant="outline" className={cn("text-[10px] ml-auto", availableEms.length > 0 ? "text-green-400 border-green-500/30" : "text-red-400 border-red-500/30")}>
              {availableEms.length} available
            </Badge>
          </div>

          {emsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (emsData?.units ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4">
              No EMS units loaded — click "Seed Demo Data" above
            </div>
          ) : (
            <div className="space-y-1.5" data-testid="ems-units-list">
              {(emsData?.units ?? []).map(unit => {
                const dist = Math.sqrt(
                  (unit.lat - patientLat) ** 2 + (unit.lon - patientLon) ** 2
                );
                const etaMin = Math.round(dist * 111 / 60 * 60); // rough km/60kph
                return (
                  <div
                    key={unit.id}
                    data-testid={`ems-unit-${unit.unit_name}`}
                    className="flex items-center justify-between rounded border px-2 py-1.5 bg-muted/20 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Siren size={11} className={unit.status === "available" ? "text-green-400" : "text-orange-400"} />
                      <span className="font-semibold">{unit.unit_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn("text-[9px] h-4", unit.status === "available" ? "text-green-400 border-green-500/30" : "text-orange-400 border-orange-500/30")}
                      >
                        {unit.status}
                      </Badge>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock size={9} /> ~{etaMin}m ETA
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* All hospitals list */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Stethoscope size={13} className="text-muted-foreground" />
            <span className="text-sm font-semibold">Network Hospitals</span>
          </div>
          {/* Quick ping list pulled from routing result — always show if seeded */}
          <HospitalList patientLat={patientLat} patientLon={patientLon} />
        </div>
      </div>
    </ScrollArea>
  );
}

function HospitalList({ patientLat, patientLon }: { patientLat: number; patientLon: number }) {
  const { data, isLoading } = useQuery<{ hospitals: Hospital[] }>({
    queryKey: ["/api/command/hospitals"],
    queryFn: () => apiRequest("GET", "/api/command/hospitals").then(r => r.json()),
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data?.hospitals?.length) return (
    <div className="text-xs text-muted-foreground text-center py-3">No hospitals seeded yet</div>
  );

  const sorted = [...data.hospitals]
    .map(h => ({ ...h, dist: Math.sqrt((h.lat - patientLat) ** 2 + (h.lon - patientLon) ** 2) * 111 }))
    .sort((a, b) => a.dist - b.dist);

  return (
    <div className="space-y-1" data-testid="hospitals-list">
      {sorted.map(h => (
        <div key={h.id} className="flex items-center justify-between text-xs rounded border px-2 py-1 bg-muted/10">
          <div className="flex items-center gap-1.5">
            <Building2 size={10} className="text-blue-400" />
            <span className="truncate max-w-[140px]">{h.name}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-muted-foreground">{h.dist.toFixed(1)}km</span>
          </div>
        </div>
      ))}
    </div>
  );
}
