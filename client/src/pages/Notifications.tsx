import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bell, BellOff } from "lucide-react";

type Notif = { id: string; type: string; title: string; body: string; read: boolean; createdAt: string };

export default function Notifications() {
  const { authFetch } = useAuth();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/notifications");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setNotifs(json.notifications || []);
      } catch (err: any) { setError(err?.message ?? "Error"); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="page-notifications">
      <div className="flex items-center gap-3"><Bell className="h-5 w-5" /><h2 className="text-xl font-semibold">Notifications</h2></div>
      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}
      {loading ? <div className="flex justify-center py-12" data-testid="status-loading"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : notifs.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-muted-foreground" data-testid="text-empty"><BellOff className="h-8 w-8 mb-2" /><p className="text-sm">No notifications</p></div>
      ) : (
        <div className="space-y-2">{notifs.map((n) => (
          <Card key={n.id} className={n.read ? "opacity-60" : ""} data-testid={`notif-${n.id}`}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div><div className="font-medium text-sm">{n.title}</div><div className="text-xs text-muted-foreground mt-1">{n.body}</div></div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={n.read ? "outline" : "default"} className="text-xs">{n.type}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}</div>
      )}
    </div>
  );
}
