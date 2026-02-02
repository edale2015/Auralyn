import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, ArrowLeft, Search, Stethoscope, CheckCircle } from "lucide-react";
import EhrExportPack from "@/components/EhrExportPack";
import { getProviderKey } from "@/lib/providerAuth";

interface CaseInfo {
  caseId: string;
  status: string;
  chiefComplaint?: string;
  createdAt?: string;
}

export default function ProviderCaseView() {
  const params = useParams<{ caseId: string }>();
  const [, setLocation] = useLocation();
  const caseId = params.caseId || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [caseInfo, setCaseInfo] = useState<CaseInfo | null>(null);
  const [inputCaseId, setInputCaseId] = useState("");

  const hasKey = !!getProviderKey();

  useEffect(() => {
    if (caseId) {
      loadCase(caseId);
    }
  }, [caseId]);

  const loadCase = async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const key = getProviderKey();
      if (!key) {
        setError("Provider key required. Set VITE_PROVIDER_KEY or log in.");
        return;
      }

      const res = await fetch(`/api/provider/case/${id}`, {
        headers: { "X-Provider-Key": key }
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Case not found");
        return;
      }

      const data = await res.json();
      setCaseInfo({
        caseId: data.caseId || id,
        status: data.status || "unknown",
        chiefComplaint: data.intake?.chiefComplaint,
        createdAt: data.createdAt
      });
    } catch (e: any) {
      setError(e?.message || "Failed to load case");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (inputCaseId.trim()) {
      setLocation(`/provider/case/${inputCaseId.trim()}`);
    }
  };

  const statusBadgeVariant = (status: string) => {
    switch (status) {
      case "signed":
        return "default";
      case "submitted":
      case "in_review":
        return "secondary";
      case "draft":
        return "outline";
      default:
        return "outline";
    }
  };

  if (!hasKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-destructive flex items-center justify-center gap-2">
              <AlertCircle className="h-6 w-6" />
              Provider Access Required
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">
              Set VITE_PROVIDER_KEY environment variable or log in with provider credentials.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Stethoscope className="h-6 w-6" />
              Provider Case View
            </h1>
            <p className="text-sm text-muted-foreground">
              EHR Export Pack for intake cases
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Find Case</CardTitle>
            <CardDescription>Enter a case ID to view the EHR export pack</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Enter case ID..."
                value={inputCaseId}
                onChange={(e) => setInputCaseId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                data-testid="input-case-id"
              />
              <Button onClick={handleSearch} data-testid="button-search-case">
                <Search className="h-4 w-4 mr-2" />
                Load
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading && (
          <Card>
            <CardContent className="pt-6 text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
              <p className="mt-4 text-muted-foreground">Loading case...</p>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card>
            <CardHeader>
              <CardTitle className="text-center text-destructive flex items-center justify-center gap-2">
                <AlertCircle className="h-6 w-6" />
                Error
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground">{error}</p>
            </CardContent>
          </Card>
        )}

        {caseInfo && !loading && !error && (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-primary" />
                    Case: {caseInfo.caseId}
                  </CardTitle>
                  <Badge variant={statusBadgeVariant(caseInfo.status)}>
                    {caseInfo.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {caseInfo.chiefComplaint && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Chief Complaint</p>
                    <p className="text-sm">{caseInfo.chiefComplaint}</p>
                  </div>
                )}
                {caseInfo.createdAt && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Created: {new Date(caseInfo.createdAt).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>

            <EhrExportPack caseId={caseInfo.caseId} />
          </>
        )}
      </div>
    </div>
  );
}
