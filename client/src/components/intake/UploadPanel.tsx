import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, X, Loader2, FileText, Image } from "lucide-react";

interface UploadedFile {
  fileId: string;
  name: string;
  mimeType: string;
}

interface UploadPanelProps {
  token: string;
  attachments: UploadedFile[];
  setAttachments: (files: UploadedFile[]) => void;
}

export default function UploadPanel({ token, attachments, setAttachments }: UploadPanelProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(file: File | null) {
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/intake/${token}/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed");
      setAttachments([...attachments, { fileId: data.fileId, name: data.name, mimeType: data.mimeType }]);
    } catch (e: any) {
      setErr(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function removeFile(fileId: string) {
    setAttachments(attachments.filter((f) => f.fileId !== fileId));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="text-upload-title">Upload photos or documents</CardTitle>
        <CardDescription>Examples: rash photo, throat photo, test result (max 8MB).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Input
            type="file"
            accept="image/*,application/pdf"
            disabled={busy}
            onChange={(e) => onPick(e.target.files?.[0] || null)}
            className="flex-1"
            data-testid="input-upload-file"
          />
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>

        {err && <div className="text-sm text-destructive" data-testid="text-upload-error">{err}</div>}

        {attachments.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Uploaded files:</div>
            {attachments.map((file) => (
              <div
                key={file.fileId}
                className="flex items-center justify-between p-2 border rounded-md"
                data-testid={`card-file-${file.fileId}`}
              >
                <div className="flex items-center gap-2">
                  {file.mimeType.startsWith("image/") ? (
                    <Image className="h-4 w-4" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  <span className="text-sm truncate max-w-[200px]">{file.name}</span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeFile(file.fileId)}
                  data-testid={`button-remove-file-${file.fileId}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
