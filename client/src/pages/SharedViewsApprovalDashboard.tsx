import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Eye, CheckCircle, Plus } from "lucide-react";

type Props = {
  token: string;
};

export default function SharedViewsApprovalDashboard({ token }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState("Board default");
  const [filtersJson, setFiltersJson] = useState(
    JSON.stringify(
      { clinicId: "clinicA", startDate: "2026-03-01", endDate: "2026-03-18" },
      null,
      2
    )
  );

  const load = async () => {
    const res = await fetch("/api/shared-views", {
      headers: { Authorization: `Bearer ${token}` },
    });
    setRows(await res.json());
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    try {
      await fetch("/api/shared-views", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          viewType: "executive",
          filters: JSON.parse(filtersJson),
        }),
      });
      await load();
    } catch {}
  };

  const approve = async (id: number) => {
    await fetch(`/api/shared-views/${id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    await load();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Eye className="h-5 w-5" /> Shared Views
      </h2>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <Input
            data-testid="input-view-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="View name"
          />
          <textarea
            data-testid="input-view-filters"
            className="border rounded px-3 py-2 w-full h-32 text-sm font-mono bg-background"
            value={filtersJson}
            onChange={(e) => setFiltersJson(e.target.value)}
          />
          <Button
            data-testid="button-create-shared-view"
            variant="outline"
            onClick={create}
          >
            <Plus className="h-4 w-4 mr-2" /> Create Shared View
          </Button>
        </CardContent>
      </Card>

      {rows.map((row) => (
        <Card key={row.id}>
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{row.name}</span>
              <Badge variant={row.isApproved ? "default" : "secondary"}>
                {row.isApproved ? "Approved" : "Pending"}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              Type: {row.viewType}
            </div>
            <div className="text-sm text-muted-foreground">
              Created By: {row.createdByUserId}
            </div>
            <div className="text-sm text-muted-foreground">
              Approved By: {row.approvedByUserId || "—"}
            </div>
            {!row.isApproved && (
              <Button
                data-testid={`button-approve-view-${row.id}`}
                size="sm"
                onClick={() => approve(row.id)}
              >
                <CheckCircle className="h-4 w-4 mr-2" /> Approve
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
