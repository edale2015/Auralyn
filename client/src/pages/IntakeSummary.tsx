import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle } from "lucide-react";

export default function IntakeSummary() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [html, setHtml] = useState("");

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await fetch(`/api/intake/${token}/summary`);
        if (res.headers.get("content-type")?.includes("text/html")) {
          const text = await res.text();
          setHtml(text);
        } else {
          const data = await res.json();
          setError(data.error || "Summary not available");
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load summary");
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="summary-loading">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <p className="mt-4 text-muted-foreground">Loading summary...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="summary-error">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-destructive flex items-center justify-center gap-2">
              <AlertCircle className="h-6 w-6" />
              Not Available
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="summary-page">
      <div
        className="max-w-4xl mx-auto"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
