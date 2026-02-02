import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Link2, Unlink, ClipboardPaste } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { providerHeaders } from "@/lib/providerAuth";
import { queryClient } from "@/lib/queryClient";

interface LinkIntakeCaseCardProps {
  encounterId: number;
  intakeCaseId?: string | null;
  onLinked?: () => void;
}

export default function LinkIntakeCaseCard({ encounterId, intakeCaseId, onLinked }: LinkIntakeCaseCardProps) {
  const { toast } = useToast();
  const [inputCaseId, setInputCaseId] = useState("");
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const handleLink = async () => {
    if (!inputCaseId.trim()) {
      toast({ title: "Error", description: "Please enter a case ID", variant: "destructive" });
      return;
    }

    setLinking(true);
    try {
      const res = await fetch(`/api/provider/encounter/${encounterId}/link-intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...providerHeaders() },
        body: JSON.stringify({ intakeCaseId: inputCaseId.trim() })
      });
      const data = await res.json();
      if (!data.ok) {
        toast({ title: "Error", description: data.error || "Failed to link", variant: "destructive" });
        return;
      }
      toast({ title: "Linked", description: "Intake case linked successfully." });
      setInputCaseId("");
      queryClient.invalidateQueries({ queryKey: ["/api/encounters", encounterId] });
      onLinked?.();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to link", variant: "destructive" });
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    try {
      const res = await fetch(`/api/provider/encounter/${encounterId}/link-intake`, {
        method: "DELETE",
        headers: { ...providerHeaders() }
      });
      const data = await res.json();
      if (!data.ok) {
        toast({ title: "Error", description: data.error || "Failed to unlink", variant: "destructive" });
        return;
      }
      toast({ title: "Unlinked", description: "Intake case unlinked." });
      queryClient.invalidateQueries({ queryKey: ["/api/encounters", encounterId] });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to unlink", variant: "destructive" });
    } finally {
      setUnlinking(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setInputCaseId(text.trim());
    } catch {
      toast({ title: "Paste failed", description: "Unable to read clipboard", variant: "destructive" });
    }
  };

  if (intakeCaseId) {
    return (
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-900/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-blue-700 dark:text-blue-400">
            <Link2 className="w-4 h-4" />
            Linked Intake Case
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Badge variant="secondary" className="font-mono text-xs truncate max-w-full">
                {intakeCaseId}
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnlink}
              disabled={unlinking}
              data-testid="button-unlink-intake"
            >
              {unlinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4 mr-1" />}
              Unlink
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="w-4 h-4" />
          Link Intake Case
        </CardTitle>
        <CardDescription>
          Attach an intake case to access the EHR Export Pack
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="intakeCaseId">Intake Case ID</Label>
            <div className="flex gap-2">
              <Input
                id="intakeCaseId"
                placeholder="CASE_..."
                value={inputCaseId}
                onChange={(e) => setInputCaseId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLink()}
                data-testid="input-link-case-id"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handlePaste}
                title="Paste from clipboard"
                data-testid="button-paste-case-id"
              >
                <ClipboardPaste className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Button
            onClick={handleLink}
            disabled={linking || !inputCaseId.trim()}
            className="w-full"
            data-testid="button-link-intake"
          >
            {linking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
            Link Intake Case
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
