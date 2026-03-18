import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";
import ExecutiveOpsDrawer from "./ExecutiveOpsDrawer";

type Props = {
  token: string;
};

export default function ExecutiveOpsButton({ token }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        data-testid="button-executive-ops"
        variant="outline"
        size="icon"
        aria-label="Executive Ops"
        title="Executive Ops"
        onClick={() => setOpen(true)}
      >
        <Settings2 className="h-4 w-4" />
      </Button>

      {open && (
        <ExecutiveOpsDrawer token={token} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
