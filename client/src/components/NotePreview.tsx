import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Save, Loader2, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type Props = {
  caseId: string;
};

export function NotePreview({ caseId }: Props) {
  const queryClient = useQueryClient();
  const [noteDraft, setNoteDraft] = useState("");
  const [physicianSummary, setPhysicianSummary] = useState("");

  const { data, isLoading } = useQuery<{ noteDraft: string | null; hasDraft: boolean }>({
    queryKey: ["/api/noteDraft", caseId],
    queryFn: async () => {
      const res = await fetch(`/api/noteDraft/${caseId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!caseId,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data?.noteDraft) {
      setNoteDraft(data.noteDraft);
    }
  }, [data]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/noteDraft/${caseId}/generate`);
      return res.json();
    },
    onSuccess: (data: any) => {
      setNoteDraft(data.noteDraft || "");
      queryClient.invalidateQueries({ queryKey: ["/api/noteDraft", caseId] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/noteDraft/${caseId}/save`, {
        noteDraft,
        physicianSummary,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/noteDraft", caseId] });
    },
  });

  if (isLoading) {
    return (
      <Card data-testid="panel-note-preview">
        <CardContent className="pt-4 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="panel-note-preview">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Note Preview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid="button-generate-draft"
          >
            {generateMutation.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3 w-3" />
            )}
            Generate Draft
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || (!noteDraft && !physicianSummary)}
            data-testid="button-save-draft"
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Save className="mr-1 h-3 w-3" />
            )}
            Save Draft
          </Button>
        </div>

        {saveMutation.isSuccess && (
          <div className="text-sm text-green-600" data-testid="text-save-success">
            Note saved successfully.
          </div>
        )}

        {(generateMutation.error || saveMutation.error) && (
          <div className="text-sm text-destructive" data-testid="text-note-error">
            {String(generateMutation.error || saveMutation.error)}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-sm font-medium">Physician Summary</label>
          <Textarea
            value={physicianSummary}
            onChange={(e) => setPhysicianSummary(e.target.value)}
            rows={3}
            placeholder="Add physician summary to include in the note..."
            data-testid="input-physician-summary"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Draft Note</label>
          <Textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={16}
            className="font-mono text-xs"
            placeholder="Click 'Generate Draft' to create a note from engine output..."
            data-testid="input-note-draft"
          />
        </div>
      </CardContent>
    </Card>
  );
}
