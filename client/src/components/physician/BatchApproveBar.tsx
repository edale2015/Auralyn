import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { CheckCircle, X, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  selectedIds: string[];
  batchEligibleIds: string[];
  onClear: () => void;
  tenantId: string | null;
}

export function BatchApproveBar({ selectedIds, batchEligibleIds, onClear, tenantId }: Props) {
  const [pin, setPin] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const { toast } = useToast();

  const eligibleSelected = selectedIds.filter(id => batchEligibleIds.includes(id));
  const ineligibleCount = selectedIds.length - eligibleSelected.length;

  const batchMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/command-strip/batch-approve", {
        caseIds: eligibleSelected,
        passwordOrPin: pin,
        selectionCriteria: "CONSENSUS HOME_CARE confidence>=0.85 no-modifiers — physician-selected batch",
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/command-strip/queue"] });
      toast({
        title: `Batch approved — ${data.approved?.length ?? eligibleSelected.length} cases`,
        description: `Signature ID: ${data.signatureId?.slice(0, 8)}…`,
      });
      setPinOpen(false);
      setPin("");
      onClear();
    },
    onError: (err: any) => {
      toast({ title: "Batch approval failed", description: err?.message ?? String(err), variant: "destructive" });
    },
  });

  if (selectedIds.length === 0) return null;

  return (
    <div
      data-testid="batch-approve-bar"
      className="sticky bottom-0 left-0 right-0 z-20 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 flex items-center gap-3 shadow-lg"
    >
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {selectedIds.length} selected
        {ineligibleCount > 0 && (
          <span className="text-amber-600 dark:text-amber-400 ml-1">
            ({ineligibleCount} not batch-eligible — Tier 2/3)
          </span>
        )}
      </span>

      {eligibleSelected.length > 0 && (
        <>
          {!pinOpen ? (
            <Button
              data-testid="batch-approve-btn"
              size="sm"
              className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setPinOpen(true)}
            >
              <CheckCircle className="h-4 w-4" />
              Batch Approve {eligibleSelected.length} Tier-1 Cases
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-slate-500" />
              <input
                data-testid="batch-pin-input"
                type="password"
                placeholder="Session PIN / password to sign"
                value={pin}
                onChange={e => setPin(e.target.value)}
                className="text-sm border border-slate-200 dark:border-slate-700 rounded px-2 py-1 w-48 bg-white dark:bg-slate-800"
                onKeyDown={e => { if (e.key === "Enter" && pin.trim()) batchMut.mutate(); }}
                autoFocus
              />
              <Button
                data-testid="batch-sign-btn"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => batchMut.mutate()}
                disabled={!pin.trim() || batchMut.isPending}
              >
                {batchMut.isPending ? "Signing…" : `Sign & Approve ${eligibleSelected.length}`}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPinOpen(false)}>
                Cancel
              </Button>
            </div>
          )}
        </>
      )}

      <button
        data-testid="clear-selection-btn"
        onClick={onClear}
        className="ml-auto text-slate-400 hover:text-slate-600 p-1 rounded"
        aria-label="Clear selection"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
