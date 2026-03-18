import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Link, Send, CheckCircle, XCircle } from "lucide-react";

type Props = {
  token: string;
};

export default function GoogleEmailConnectPage({ token }: Props) {
  const [status, setStatus] = useState<any>(null);
  const [sendStatus, setSendStatus] = useState("");
  const [recipient, setRecipient] = useState("test@example.com");

  useEffect(() => {
    fetch("/api/deployment-status/gmail", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setStatus);
  }, []);

  const connect = async () => {
    const res = await fetch("/api/google-email/connect", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    window.location.href = data.url;
  };

  const sendTest = async () => {
    const res = await fetch("/api/google-email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: recipient,
        subject: "Auralyn Gmail setup test",
        body: "This is a production setup test for Gmail OAuth and send flow.",
      }),
    });
    const data = await res.json();
    setSendStatus(JSON.stringify(data, null, 2));
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Mail className="h-5 w-5" /> Google Email
      </h2>

      {status && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              {status.configured ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className="font-medium">
                Configured: {String(status.configured)}
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              <strong>Redirect URI:</strong> {status.redirectUri || "Not set"}
            </div>
            <div className="text-sm text-muted-foreground">
              <strong>Scopes:</strong> {status.scopes?.join(", ")}
            </div>
            <div className="pt-2">
              <strong className="text-sm">Setup Checklist:</strong>
              <ul className="list-disc pl-6 text-sm text-muted-foreground mt-1 space-y-1">
                {status.checklist?.googleCloud?.map((item: string) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <Button
        data-testid="button-connect-google-email"
        variant="outline"
        onClick={connect}
      >
        <Link className="h-4 w-4 mr-2" /> Connect Google Email
      </Button>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <p className="font-semibold text-sm">Test Send</p>
          <Input
            data-testid="input-email-recipient"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="recipient@example.com"
          />
          <Button
            data-testid="button-send-test-email"
            variant="outline"
            onClick={sendTest}
          >
            <Send className="h-4 w-4 mr-2" /> Send Test Email
          </Button>
          {sendStatus && (
            <pre className="border rounded p-3 overflow-auto text-xs bg-muted">
              {sendStatus}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
