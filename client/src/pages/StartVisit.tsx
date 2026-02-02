import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Stethoscope } from "lucide-react";

function extractToken(input: string): string {
  const s = (input || "").trim();
  if (!s) return "";

  try {
    const url = new URL(s);
    const path = url.pathname || "";
    const m =
      path.match(/\/simple\/([^/]+)/) ||
      path.match(/\/intake\/([^/]+)/);

    if (m?.[1]) return decodeURIComponent(m[1]);
  } catch {
    // Not a URL, continue
  }

  const m2 =
    s.match(/\/simple\/([^/]+)/) ||
    s.match(/\/intake\/([^/]+)/);
  if (m2?.[1]) return decodeURIComponent(m2[1]);

  return s;
}

export default function StartVisit() {
  const [, setLocation] = useLocation();
  const [raw, setRaw] = useState("");

  const token = useMemo(() => extractToken(raw), [raw]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (token) {
      setLocation(`/simple/${encodeURIComponent(token)}`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4" data-testid="start-visit-page">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Stethoscope className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl" data-testid="text-welcome-title">Secure Check-in</CardTitle>
          <CardDescription>
            Paste your secure link or token from WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              data-testid="input-token-or-link"
              type="text"
              placeholder="Paste token or link"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
            />
            <Button
              type="submit"
              data-testid="button-continue"
              className="w-full"
              disabled={!token}
            >
              Continue
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
          </div>

          <div className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              If your link expired, reply <strong>LINK</strong> on WhatsApp to get a new one.
            </p>
            <p className="text-sm text-muted-foreground">
              Clinician?{" "}
              <a href="/" className="text-primary hover:underline" data-testid="link-clinician-login">
                Log in
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
