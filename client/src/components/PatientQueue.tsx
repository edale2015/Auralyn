import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  ChevronRight,
  MessageSquare,
  User
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Encounter } from "@shared/schema";

interface PatientQueueProps {
  encounters: Encounter[];
  filter: "pending" | "approved" | "all";
  selectedId: number | null;
  onSelect: (id: number) => void;
}

const statusConfig = {
  gathering_info: { label: "Gathering Info", variant: "secondary" as const, icon: MessageSquare },
  pending_review: { label: "Pending Review", variant: "default" as const, icon: Clock },
  approved: { label: "Approved", variant: "outline" as const, icon: CheckCircle },
  rejected: { label: "Rejected", variant: "destructive" as const, icon: AlertTriangle },
};

const urgencyConfig = {
  routine: { label: "Routine", className: "bg-muted text-muted-foreground" },
  urgent: { label: "Urgent", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  emergent: { label: "Emergent", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
};

export default function PatientQueue({ encounters, filter, selectedId, onSelect }: PatientQueueProps) {
  const filteredEncounters = encounters.filter((e) => {
    if (filter === "pending") return e.status === "pending_review";
    if (filter === "approved") return e.status === "approved";
    return true;
  });

  if (filteredEncounters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          {filter === "pending" ? (
            <Clock className="w-8 h-8 text-muted-foreground" />
          ) : filter === "approved" ? (
            <CheckCircle className="w-8 h-8 text-muted-foreground" />
          ) : (
            <User className="w-8 h-8 text-muted-foreground" />
          )}
        </div>
        <h3 className="text-lg font-medium mb-2">No cases found</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {filter === "pending" 
            ? "No cases are currently waiting for review." 
            : filter === "approved"
            ? "No approved cases yet."
            : "No patient encounters in the system."}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {filteredEncounters.map((encounter) => {
        const status = statusConfig[encounter.status as keyof typeof statusConfig] || statusConfig.pending_review;
        const urgency = urgencyConfig[encounter.urgencyLevel as keyof typeof urgencyConfig] || urgencyConfig.routine;
        const StatusIcon = status.icon;

        return (
          <Card 
            key={encounter.id}
            className={`cursor-pointer transition-colors hover-elevate ${
              selectedId === encounter.id ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => onSelect(encounter.id)}
            data-testid={`case-card-${encounter.id}`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={urgency.className} variant="secondary">
                      {urgency.label}
                    </Badge>
                    <Badge variant={status.variant}>
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {status.label}
                    </Badge>
                  </div>
                  
                  <h4 className="font-medium text-sm mb-1 truncate">
                    {encounter.chiefComplaint || "Chief complaint pending..."}
                  </h4>
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="font-mono">Case #{encounter.id}</span>
                    <span>Patient #{encounter.patientId}</span>
                    <span>
                      {formatDistanceToNow(new Date(encounter.createdAt), { addSuffix: true })}
                    </span>
                  </div>

                  {encounter.aiDiagnosis && (
                    <div className="mt-2 p-2 bg-muted/50 rounded-md">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">AI Suggestion:</span>{" "}
                        {encounter.aiDiagnosis}
                        {encounter.aiConfidence && (
                          <span className="ml-2 text-muted-foreground">
                            ({encounter.aiConfidence}% confidence)
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                </div>

                <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
