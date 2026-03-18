import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Mail } from "lucide-react";

type Props = {
  token: string;
};

export default function SendWeeklySummaryButton({ token }: Props) {
  const [recipientEmail, setRecipientEmail] = useState("admin@clinica.com");
  const [result, setResult] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/google-email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: recipientEmail,
          subject: "Auralyn Weekly Executive Summary",
          body: [
            "Clinic A processed 3,200 cases with stable safety posture.",
            "",
            "Override rate: 11.0%",
            "Average satisfaction: 4.56",
            "Top pressure complaint: dizziness",
            "Safety mode: elevated",
            "",
            "— Auralyn Executive Dashboard",
          ].join("\n"),
        }),
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setResult(JSON.stringify({ error: e.message }, null, 2));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <p className="font-semibold text-sm flex items-center gap-2">
          <Mail className="h-4 w-4" /> Send Weekly Summary
        </p>
        <Input
          data-testid="input-weekly-summary-recipient"
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          placeholder="recipient@example.com"
        />
        <Button
          data-testid="button-send-weekly-summary"
          variant="outline"
          onClick={send}
          disabled={sending}
        >
          {sending ? "Sending..." : "Send Weekly Summary"}
        </Button>
        {result && (
          <pre className="border rounded p-3 overflow-auto text-xs bg-muted">
            {result}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
