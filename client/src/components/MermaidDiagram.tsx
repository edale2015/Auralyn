import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { Loader2, AlertCircle } from "lucide-react";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "loose",
  theme: "default",
  flowchart: { useMaxWidth: true, htmlLabels: true },
  mindmap: { useMaxWidth: true },
});

interface MermaidDiagramProps {
  chart: string;
  className?: string;
  onError?: (err: string) => void;
}

let diagramIdCounter = 0;

export default function MermaidDiagram({ chart, className = "", onError }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    if (!chart?.trim()) return;

    let mounted = true;
    setState("loading");

    async function render() {
      if (!ref.current) return;
      const id = `mermaid-${Date.now()}-${++diagramIdCounter}`;
      try {
        const { svg } = await mermaid.render(id, chart.trim());
        if (mounted && ref.current) {
          ref.current.innerHTML = svg;
          // make SVG responsive
          const svgEl = ref.current.querySelector("svg");
          if (svgEl) {
            svgEl.style.width = "100%";
            svgEl.style.maxWidth = "100%";
            svgEl.style.height = "auto";
          }
          setState("ready");
        }
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        if (mounted) {
          setState("error");
          setErrMsg(msg);
          onError?.(msg);
        }
      }
    }

    render();
    return () => { mounted = false; };
  }, [chart]);

  return (
    <div className={`relative min-h-16 ${className}`}>
      {state === "loading" && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm p-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Rendering diagram…</span>
        </div>
      )}
      {state === "error" && (
        <div className="flex items-start gap-2 text-destructive text-sm p-4 rounded border border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Diagram error</p>
            <p className="text-xs mt-0.5 opacity-75">{errMsg}</p>
          </div>
        </div>
      )}
      <div
        ref={ref}
        className={`w-full overflow-x-auto ${state !== "ready" ? "hidden" : ""}`}
        data-testid="mermaid-diagram"
      />
    </div>
  );
}
