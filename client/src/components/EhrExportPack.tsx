import { useQuery } from "@tanstack/react-query";
import { Copy, FileText, Receipt, Paperclip, ExternalLink, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

import { getNote, getBilling, getPacketHtml, getFiles } from "@/lib/ehrexportApi";
import { getProviderKey } from "@/lib/providerAuth";

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

export default function EhrExportPack({ caseId }: { caseId: string }) {
  const { toast } = useToast();
  const hasKey = !!getProviderKey();

  const noteQ = useQuery({
    queryKey: ["ehrpack", "note", caseId],
    queryFn: () => getNote(caseId),
    enabled: !!caseId && hasKey,
    staleTime: 30_000
  });

  const billingQ = useQuery({
    queryKey: ["ehrpack", "billing", caseId],
    queryFn: () => getBilling(caseId),
    enabled: !!caseId && hasKey,
    staleTime: 30_000
  });

  const filesQ = useQuery({
    queryKey: ["ehrpack", "files", caseId],
    queryFn: () => getFiles(caseId),
    enabled: !!caseId && hasKey,
    staleTime: 15_000
  });

  const packetQ = useQuery({
    queryKey: ["ehrpack", "packet", caseId],
    queryFn: () => getPacketHtml(caseId),
    enabled: false
  });

  const anyLoading = noteQ.isLoading || billingQ.isLoading || filesQ.isLoading;

  function needKeyToast() {
    toast({
      title: "Provider access required",
      description: "No provider key found. Log in or set the provider key for dashboard access.",
      variant: "destructive"
    });
  }

  async function onCopyNote() {
    if (!hasKey) return needKeyToast();
    try {
      const result = await noteQ.refetch();
      const text = result.data;
      if (!text) {
        toast({ title: "Error", description: "Failed to load note. Please try again.", variant: "destructive" });
        return;
      }
      await copyToClipboard(text);
      toast({ title: "Copied", description: "Visit note draft copied to clipboard." });
    } catch (e) {
      toast({ title: "Error", description: "Failed to load note. Check provider access.", variant: "destructive" });
    }
  }

  async function onCopyBilling() {
    if (!hasKey) return needKeyToast();
    try {
      const result = await billingQ.refetch();
      const data = result.data;
      if (!data) {
        toast({ title: "Error", description: "Failed to load billing. Please try again.", variant: "destructive" });
        return;
      }

      const icd = (data.icd10 || []).join(", ");
      const cpt = (data.cpt || []).join(", ");

      const text =
`Billing suggestions
ICD-10: ${icd || "—"}
CPT: ${cpt || "—"}
${data.notes ? `Notes: ${data.notes}` : ""}`.trim();

      await copyToClipboard(text);
      toast({ title: "Copied", description: "Billing suggestions copied to clipboard." });
    } catch (e) {
      toast({ title: "Error", description: "Failed to load billing. Check provider access.", variant: "destructive" });
    }
  }

  async function onOpenPacket() {
    if (!hasKey) return needKeyToast();
    try {
      const result = await packetQ.refetch();
      const html = result.data;
      if (!html) {
        toast({ title: "Error", description: "Failed to load packet. Please try again.", variant: "destructive" });
        return;
      }

      const w = window.open("", "_blank");
      if (!w) {
        toast({ title: "Popup blocked", description: "Allow popups to open the intake packet.", variant: "destructive" });
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e) {
      toast({ title: "Error", description: "Failed to load packet. Check provider access.", variant: "destructive" });
    }
  }

  const refreshAll = () => {
    noteQ.refetch();
    billingQ.refetch();
    filesQ.refetch();
  };

  return (
    <Card className="mt-4" data-testid="card-ehr-export-pack">
      <CardHeader className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              EHR Export Pack
              <Badge variant="secondary">Copy/Paste</Badge>
            </CardTitle>
            <CardDescription>
              One-click exports for eCW workflow. (Provider-only)
            </CardDescription>
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={refreshAll} 
            disabled={!hasKey || anyLoading}
            data-testid="button-refresh-export"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {!hasKey && (
          <div className="text-sm text-destructive" data-testid="text-no-provider-key">
            No provider key detected. Log in to enable exports.
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={onCopyNote} 
            disabled={!hasKey || noteQ.isFetching}
            data-testid="button-copy-note"
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy Note
          </Button>

          <Button 
            variant="secondary" 
            onClick={onCopyBilling} 
            disabled={!hasKey || billingQ.isFetching}
            data-testid="button-copy-billing"
          >
            <Receipt className="h-4 w-4 mr-2" />
            Copy Billing
          </Button>

          <Button 
            variant="outline" 
            onClick={onOpenPacket} 
            disabled={!hasKey || packetQ.isFetching}
            data-testid="button-open-packet"
          >
            <FileText className="h-4 w-4 mr-2" />
            Open Packet
            <ExternalLink className="h-4 w-4 ml-2" />
          </Button>
        </div>

        <Separator />

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Paperclip className="h-4 w-4" />
            <div className="font-medium">Attachments</div>
            {filesQ.data?.files?.length ? (
              <Badge variant="secondary" data-testid="badge-attachment-count">
                {filesQ.data.files.length}
              </Badge>
            ) : null}
          </div>

          {filesQ.isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          )}

          {filesQ.isError && (
            <div className="text-sm text-destructive" data-testid="text-files-error">
              Failed to load attachments.
            </div>
          )}

          {!filesQ.isLoading && !filesQ.isError && (
            <div className="space-y-2" data-testid="list-attachments">
              {(filesQ.data?.files || []).length === 0 ? (
                <div className="text-sm text-muted-foreground">No attachments uploaded.</div>
              ) : (
                filesQ.data!.files.map((f) => (
                  <div 
                    key={f.fileId} 
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                    data-testid={`attachment-item-${f.fileId}`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{f.originalName}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.mimeType}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(f.downloadUrl, "_blank")}
                      disabled={!hasKey}
                      data-testid={`button-view-${f.fileId}`}
                    >
                      View
                      <ExternalLink className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <Separator />

        <div className="text-xs text-muted-foreground">
          Tip: paste the note into eCW's encounter note, paste billing into charge capture, and attach packet/attachments as needed.
        </div>
      </CardContent>
    </Card>
  );
}
