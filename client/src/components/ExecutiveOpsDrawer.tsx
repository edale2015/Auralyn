import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Mail, Eye, FileText, Target, Bell } from "lucide-react";
import GoogleEmailConnectPage from "@/pages/GoogleEmailConnectPage";
import SharedViewsApprovalDashboard from "@/pages/SharedViewsApprovalDashboard";
import BenchmarkTrendsDashboard from "@/pages/BenchmarkTrendsDashboard";
import AlertCenterAcknowledge from "@/pages/AlertCenterAcknowledge";
import SendWeeklySummaryButton from "./SendWeeklySummaryButton";

type Props = {
  token: string;
  onClose: () => void;
};

type Tab =
  | "google-email"
  | "shared-views"
  | "signed-export"
  | "benchmarks"
  | "alerts";

const TABS: { id: Tab; label: string; icon: typeof Mail }[] = [
  { id: "google-email", label: "Email", icon: Mail },
  { id: "shared-views", label: "Views", icon: Eye },
  { id: "signed-export", label: "Signed Export", icon: FileText },
  { id: "benchmarks", label: "Benchmarks", icon: Target },
  { id: "alerts", label: "Alerts", icon: Bell },
];

export default function ExecutiveOpsDrawer({ token, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("google-email");
  const [signedPayload, setSignedPayload] = useState<any>(null);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  const signBoardExport = async () => {
    const res = await fetch("/api/signed-board-exports/json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "Executive Board Packet",
        summaryLines: [
          "Clinic A processed 3,200 cases.",
          "Override rate 11.0%",
          "Margin 41.2%",
        ],
        cards: [
          { title: "Cases", value: 3200 },
          { title: "Margin", value: "41.2%" },
        ],
      }),
    });
    setSignedPayload(await res.json());
    setVerifyResult(null);
  };

  const verifyBoardExport = async () => {
    if (!signedPayload) return;
    const res = await fetch("/api/signed-board-exports/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        payload: signedPayload.payload,
        signature: signedPayload.signature,
      }),
    });
    setVerifyResult(await res.json());
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40" data-testid="executive-ops-overlay">
      <div className="absolute right-0 top-0 h-full w-full max-w-3xl bg-background shadow-xl border-l flex flex-col">
        <div className="flex items-center justify-between border-b p-4">
          <h1 className="text-xl font-bold">Executive Ops</h1>
          <Button
            data-testid="button-close-executive-ops"
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex gap-1 border-b p-3 flex-wrap">
          {TABS.map((t) => (
            <Button
              key={t.id}
              data-testid={`tab-ops-${t.id}`}
              variant={tab === t.id ? "default" : "outline"}
              size="sm"
              onClick={() => setTab(t.id)}
            >
              <t.icon className="h-4 w-4 mr-1" />
              {t.label}
            </Button>
          ))}
        </div>

        <div className="p-4 overflow-auto flex-1">
          {tab === "google-email" && (
            <div className="space-y-4">
              <GoogleEmailConnectPage token={token} />
              <SendWeeklySummaryButton token={token} />
            </div>
          )}
          {tab === "shared-views" && (
            <SharedViewsApprovalDashboard token={token} />
          )}
          {tab === "benchmarks" && <BenchmarkTrendsDashboard />}
          {tab === "alerts" && <AlertCenterAcknowledge token={token} />}

          {tab === "signed-export" && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5" /> Signed Board Export
              </h2>
              <div className="flex gap-2 flex-wrap">
                <Button
                  data-testid="button-sign-json"
                  variant="outline"
                  onClick={signBoardExport}
                >
                  Sign JSON
                </Button>
                <Button
                  data-testid="button-verify-signature"
                  variant="outline"
                  onClick={verifyBoardExport}
                  disabled={!signedPayload}
                >
                  Verify Signature
                </Button>
              </div>

              {signedPayload && (
                <pre
                  data-testid="text-signed-payload"
                  className="border rounded p-3 overflow-auto text-xs bg-muted"
                >
                  {JSON.stringify(signedPayload, null, 2)}
                </pre>
              )}

              {verifyResult && (
                <pre
                  data-testid="text-verify-result"
                  className="border rounded p-3 overflow-auto text-xs bg-muted"
                >
                  {JSON.stringify(verifyResult, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
