import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Check, X, Clock, Lightbulb } from "lucide-react";

type SuggestionType =
  | "promote_question"
  | "add_red_flag"
  | "strengthen_threshold"
  | "increase_dx_support"
  | "add_trigger";

type SuggestionStatus = "pending" | "accepted" | "rejected" | "postponed";

interface RuleSuggestion {
  suggestionId: string;
  complaintId: string;
  type: SuggestionType;
  description: string;
  rationale: string;
  status: SuggestionStatus;
  createdAt: string;
  updatedAt: string;
}

const TYPE_OPTIONS: { value: SuggestionType; label: string }[] = [
  { value: "promote_question", label: "Promote Question" },
  { value: "add_red_flag", label: "Add Red Flag" },
  { value: "strengthen_threshold", label: "Strengthen Threshold" },
  { value: "increase_dx_support", label: "Increase DX Support" },
  { value: "add_trigger", label: "Add Trigger" },
];

const STATUS_COLORS: Record<SuggestionStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  accepted: "default",
  rejected: "destructive",
  postponed: "secondary",
};

export default function RuleSuggestions() {
  const { toast } = useToast();
  const [complaintFilter, setComplaintFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formComplaint, setFormComplaint] = useState("");
  const [formType, setFormType] = useState<SuggestionType>("promote_question");
  const [formDescription, setFormDescription] = useState("");
  const [formRationale, setFormRationale] = useState("");

  const queryKey = complaintFilter
    ? ["/api/ruleSuggestions", `?complaintId=${complaintFilter}`]
    : ["/api/ruleSuggestions"];

  const { data, isLoading } = useQuery<{ suggestions: RuleSuggestion[] }>({
    queryKey,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/ruleSuggestions", {
        complaintId: formComplaint,
        type: formType,
        description: formDescription,
        rationale: formRationale,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ruleSuggestions"] });
      setShowForm(false);
      setFormComplaint("");
      setFormDescription("");
      setFormRationale("");
      toast({ title: "Suggestion created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SuggestionStatus }) => {
      await apiRequest("PATCH", `/api/ruleSuggestions/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ruleSuggestions"] });
      toast({ title: "Status updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const suggestions = data?.suggestions ?? [];

  const pendingCount = suggestions.filter((s) => s.status === "pending").length;
  const acceptedCount = suggestions.filter((s) => s.status === "accepted").length;
  const rejectedCount = suggestions.filter((s) => s.status === "rejected").length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Rule Suggestions</h1>
          <p className="text-sm text-muted-foreground">
            Propose and review rule changes for complaint configurations
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} data-testid="button-toggle-form">
          <Plus className="w-4 h-4 mr-2" />
          New Suggestion
        </Button>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <Input
          placeholder="Filter by complaint ID..."
          value={complaintFilter}
          onChange={(e) => setComplaintFilter(e.target.value)}
          className="max-w-xs"
          data-testid="input-complaint-filter"
        />
        <div className="flex items-center gap-2">
          <Badge variant="outline" data-testid="badge-pending-count">
            Pending: {pendingCount}
          </Badge>
          <Badge variant="default" data-testid="badge-accepted-count">
            Accepted: {acceptedCount}
          </Badge>
          <Badge variant="destructive" data-testid="badge-rejected-count">
            Rejected: {rejectedCount}
          </Badge>
        </div>
      </div>

      {showForm && (
        <Card data-testid="card-new-suggestion-form">
          <CardHeader>
            <CardTitle className="text-lg">New Rule Suggestion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Complaint ID</label>
                <Input
                  placeholder="e.g. cough, sore_throat"
                  value={formComplaint}
                  onChange={(e) => setFormComplaint(e.target.value)}
                  data-testid="input-form-complaint"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <Select value={formType} onValueChange={(v) => setFormType(v as SuggestionType)}>
                  <SelectTrigger data-testid="select-form-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Describe the rule change..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                data-testid="input-form-description"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Rationale</label>
              <Textarea
                placeholder="Why is this change needed?"
                value={formRationale}
                onChange={(e) => setFormRationale(e.target.value)}
                data-testid="input-form-rationale"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!formComplaint || !formDescription || !formRationale || createMutation.isPending}
                data-testid="button-submit-suggestion"
              >
                {createMutation.isPending ? "Creating..." : "Create Suggestion"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-form">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Lightbulb className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground" data-testid="text-empty-state">
              No rule suggestions found. Create one to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <Card key={s.suggestionId} data-testid={`card-suggestion-${s.suggestionId}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={STATUS_COLORS[s.status]} data-testid={`badge-status-${s.suggestionId}`}>
                        {s.status}
                      </Badge>
                      <Badge variant="outline" data-testid={`badge-type-${s.suggestionId}`}>
                        {TYPE_OPTIONS.find((t) => t.value === s.type)?.label ?? s.type}
                      </Badge>
                      <span className="text-sm text-muted-foreground" data-testid={`text-complaint-${s.suggestionId}`}>
                        {s.complaintId}
                      </span>
                    </div>
                    <p className="text-sm font-medium" data-testid={`text-description-${s.suggestionId}`}>
                      {s.description}
                    </p>
                    <p className="text-sm text-muted-foreground" data-testid={`text-rationale-${s.suggestionId}`}>
                      {s.rationale}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {s.status === "pending" && (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => statusMutation.mutate({ id: s.suggestionId, status: "accepted" })}
                        disabled={statusMutation.isPending}
                        data-testid={`button-accept-${s.suggestionId}`}
                      >
                        <Check className="w-4 h-4 text-green-600" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => statusMutation.mutate({ id: s.suggestionId, status: "rejected" })}
                        disabled={statusMutation.isPending}
                        data-testid={`button-reject-${s.suggestionId}`}
                      >
                        <X className="w-4 h-4 text-red-600" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => statusMutation.mutate({ id: s.suggestionId, status: "postponed" })}
                        disabled={statusMutation.isPending}
                        data-testid={`button-postpone-${s.suggestionId}`}
                      >
                        <Clock className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
