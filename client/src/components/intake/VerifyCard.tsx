import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface VerifyCardProps {
  token: string;
  onVerified: (data: { caseId: string; savedDraft?: Record<string, any> | null; currentStep?: number }) => void;
}

export default function VerifyCard({ token, onVerified }: VerifyCardProps) {
  const [code, setCode] = useState("");
  const [dob, setDob] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    setErr(null);
    setBusy(true);
    try {
      const res = await apiRequest("POST", `/api/intake/${token}/verify`, { code, dob: dob || undefined });
      const data = await res.json();
      if (data.ok) {
        onVerified({ caseId: data.caseId, savedDraft: data.savedDraft, currentStep: data.currentStep });
      } else {
        setErr(data.error || "Verification failed");
      }
    } catch (e: any) {
      setErr(e?.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="text-verify-title">Verify your secure link</CardTitle>
        <CardDescription>Enter the 6-digit code you received via WhatsApp.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code">6-digit code</Label>
          <Input
            id="code"
            data-testid="input-verify-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            maxLength={6}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dob">Date of birth (optional)</Label>
          <Input
            id="dob"
            data-testid="input-verify-dob"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </div>

        {err && <div className="text-sm text-destructive" data-testid="text-verify-error">{err}</div>}

        <Button
          data-testid="button-verify-submit"
          disabled={busy || code.length < 4}
          onClick={verify}
          className="w-full"
        >
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking...</> : "Verify"}
        </Button>
      </CardContent>
    </Card>
  );
}
