import { Badge } from "@/components/ui/badge";

type Props = {
  type?: string;
};

function variantFor(type?: string): "default" | "secondary" | "destructive" | "outline" {
  switch (type) {
    case "DISPOSITION_MISMATCH":
      return "destructive";
    case "DX_TOP_MISMATCH":
      return "secondary";
    case "RED_FLAG_OVERRIDE":
      return "destructive";
    case "REQUEST_MORE_INFO":
      return "outline";
    default:
      return "default";
  }
}

function labelFor(type?: string): string {
  switch (type) {
    case "DISPOSITION_MISMATCH":
      return "Disposition Mismatch";
    case "DX_TOP_MISMATCH":
      return "Dx Mismatch";
    case "RED_FLAG_OVERRIDE":
      return "Red Flag Override";
    case "REQUEST_MORE_INFO":
      return "More Info Requested";
    default:
      return "No Discrepancy";
  }
}

export function DiscrepancyBadge({ type }: Props) {
  return (
    <Badge variant={variantFor(type)} data-testid={`badge-discrepancy-${type ?? "none"}`}>
      {labelFor(type)}
    </Badge>
  );
}
