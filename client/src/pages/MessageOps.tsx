import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare } from "lucide-react";

type Msg = { id: string; channel: string; recipientId: string; content: string; status: string; createdAt: string };

export default function MessageOps() {
  const { authFetch } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/messages");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setMessages(json.messages || []);
      } catch (err: any) { setError(err?.message ?? "Error"); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="page-message-ops">
      <div className="flex items-center gap-3"><MessageSquare className="h-5 w-5" /><h2 className="text-xl font-semibold">Message Operations</h2></div>
      {error && <div className="text-sm text-destructive" data-testid="text-error">{error}</div>}
      {loading ? <div className="flex justify-center py-12" data-testid="status-loading"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : messages.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="text-empty">No messages.</p> : (
        <div className="space-y-2">{messages.map((m) => (
          <Card key={m.id} data-testid={`msg-${m.id}`}><CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div><div className="text-sm">{m.content}</div><div className="text-xs text-muted-foreground mt-1">To: {m.recipientId}</div></div>
              <div className="flex gap-1"><Badge variant="outline" className="text-xs">{m.channel}</Badge><Badge variant="secondary" className="text-xs">{m.status}</Badge></div>
            </div>
          </CardContent></Card>
        ))}</div>
      )}
    </div>
  );
}
