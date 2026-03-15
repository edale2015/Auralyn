import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Loader2, MessageSquare, ShieldAlert, Settings, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";

interface Msg {
  id: string;
  channel: string;
  recipientId: string;
  content: string;
  status: string;
  createdAt: string;
}

interface ChannelThreshold {
  channel: string;
  dailyLimit: number;
  hourlyLimit: number;
  perRecipientDailyLimit: number;
  enabled: boolean;
  alertOnBreach: boolean;
  updatedAt: string;
  updatedBy: string;
}

interface BreachEvent {
  channel: string;
  breachType: 'daily' | 'hourly' | 'per_recipient';
  current: number;
  limit: number;
  recipientId?: string;
  timestamp: string;
}

interface ThresholdsResponse {
  thresholds: ChannelThreshold[];
  usage: Record<string, { hourly: number; daily: number }>;
  recentBreaches: BreachEvent[];
}

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: 'bg-green-100 text-green-700 border-green-300',
  telegram: 'bg-blue-100 text-blue-700 border-blue-300',
  sms: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  email: 'bg-purple-100 text-purple-700 border-purple-300',
};

function UsageBar({ current, limit, label }: { current: number; limit: number; label: string }) {
  const pct = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const color = pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={pct > 80 ? 'text-red-600 font-semibold' : 'text-muted-foreground'}>{current} / {limit}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ThresholdEditor({ threshold, usage, onSave }: {
  threshold: ChannelThreshold;
  usage: { hourly: number; daily: number } | undefined;
  onSave: (channel: string, updates: Partial<ChannelThreshold>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    dailyLimit: threshold.dailyLimit,
    hourlyLimit: threshold.hourlyLimit,
    perRecipientDailyLimit: threshold.perRecipientDailyLimit,
    enabled: threshold.enabled,
    alertOnBreach: threshold.alertOnBreach,
  });

  const channelColor = CHANNEL_COLORS[threshold.channel] ?? 'bg-gray-100 text-gray-700';
  const u = usage ?? { hourly: 0, daily: 0 };

  return (
    <Card data-testid={`threshold-card-${threshold.channel}`} className={`border ${!threshold.enabled ? 'opacity-60' : ''}`}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge className={`text-xs capitalize border ${channelColor}`}>{threshold.channel}</Badge>
            {!threshold.enabled && <Badge variant="outline" className="text-xs text-red-500 border-red-300">Disabled</Badge>}
            {threshold.alertOnBreach && <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setEditing(!editing)} data-testid={`button-edit-${threshold.channel}`}>
            <Settings className="h-3.5 w-3.5 mr-1" /> {editing ? 'Cancel' : 'Edit'}
          </Button>
        </div>

        <div className="space-y-1.5">
          <UsageBar current={u.hourly} limit={threshold.hourlyLimit} label="Hourly" />
          <UsageBar current={u.daily} limit={threshold.dailyLimit} label="Daily" />
        </div>

        {editing && (
          <div className="space-y-3 border-t pt-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Daily limit</Label>
                <Input type="number" min={1} value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: +e.target.value })} className="h-8 text-sm mt-1" data-testid={`input-daily-${threshold.channel}`} />
              </div>
              <div>
                <Label className="text-xs">Hourly limit</Label>
                <Input type="number" min={1} value={form.hourlyLimit} onChange={(e) => setForm({ ...form, hourlyLimit: +e.target.value })} className="h-8 text-sm mt-1" data-testid={`input-hourly-${threshold.channel}`} />
              </div>
              <div>
                <Label className="text-xs">Per-recipient/day</Label>
                <Input type="number" min={1} value={form.perRecipientDailyLimit} onChange={(e) => setForm({ ...form, perRecipientDailyLimit: +e.target.value })} className="h-8 text-sm mt-1" data-testid={`input-per-recipient-${threshold.channel}`} />
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
                <Label className="text-xs">Enabled</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.alertOnBreach} onCheckedChange={(v) => setForm({ ...form, alertOnBreach: v })} />
                <Label className="text-xs">Alert on breach</Label>
              </div>
            </div>
            <Button size="sm" onClick={() => { onSave(threshold.channel, form); setEditing(false); }} data-testid={`button-save-${threshold.channel}`}>
              Save limits
            </Button>
          </div>
        )}

        {!editing && (
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>Daily: {threshold.dailyLimit}</span>
            <span>Hourly: {threshold.hourlyLimit}</span>
            <span>Per-recipient: {threshold.perRecipientDailyLimit}/day</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MessageOps() {
  const { toast } = useToast();

  const { data: messagesData, isLoading: msgLoading } = useQuery<{ messages: Msg[] }>({
    queryKey: ['/api/messages'],
    refetchInterval: 30_000,
  });

  const { data: thresholdsData, isLoading: threshLoading, refetch: refetchThresholds } = useQuery<ThresholdsResponse>({
    queryKey: ['/api/messages/thresholds'],
    refetchInterval: 20_000,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ channel, updates }: { channel: string; updates: Partial<ChannelThreshold> }) => {
      const r = await apiRequest('POST', `/api/messages/thresholds/${channel}`, updates);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages/thresholds'] });
      toast({ title: 'Threshold saved' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const messages = messagesData?.messages ?? [];
  const thresholds = thresholdsData?.thresholds ?? [];
  const usage = thresholdsData?.usage ?? {};
  const breaches = thresholdsData?.recentBreaches ?? [];

  const alertChannels = thresholds.filter((t) => {
    const u = usage[t.channel];
    if (!u) return false;
    return u.daily / t.dailyLimit > 0.8 || u.hourly / t.hourlyLimit > 0.8;
  });

  return (
    <div className="p-6 space-y-5 max-w-5xl" data-testid="page-message-ops">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Message Operations</h2>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchThresholds()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {alertChannels.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 rounded-lg px-4 py-3" data-testid="alert-threshold-warning">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-300">
            <span className="font-medium">Threshold Warning:</span>{' '}
            {alertChannels.map((t) => t.channel).join(', ')} approaching daily or hourly limit
          </div>
        </div>
      )}

      <Tabs defaultValue="thresholds">
        <TabsList>
          <TabsTrigger value="thresholds" data-testid="tab-thresholds" className="gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> Alert Thresholds
            {alertChannels.length > 0 && <Badge className="ml-1 bg-amber-500 text-white text-[10px] h-4 px-1">{alertChannels.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="messages" data-testid="tab-messages" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" /> Messages
            {messages.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">{messages.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="breaches" data-testid="tab-breaches" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Breach Log
            {breaches.length > 0 && <Badge variant="destructive" className="ml-1 text-[10px] h-4 px-1">{breaches.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="thresholds" className="mt-4">
          {threshLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Configure per-channel daily and hourly send limits. Messages exceeding these limits are blocked (HTTP 429) and logged.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {thresholds.map((t) => (
                  <ThresholdEditor
                    key={t.channel}
                    threshold={t}
                    usage={usage[t.channel]}
                    onSave={(channel, updates) => saveMutation.mutate({ channel, updates })}
                  />
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          {msgLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center" data-testid="text-empty">No messages sent yet.</p>
          ) : (
            <div className="space-y-2">
              {messages.map((m) => (
                <Card key={m.id} data-testid={`msg-${m.id}`}>
                  <CardContent className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{m.content}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">To: {m.recipientId} · {m.createdAt ? new Date(m.createdAt).toLocaleString() : '—'}</div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Badge className={`text-xs capitalize border ${CHANNEL_COLORS[m.channel] ?? 'bg-gray-100'}`}>{m.channel}</Badge>
                        <Badge variant={m.status === 'sent' || m.status === 'delivered' ? 'default' : m.status === 'failed' ? 'destructive' : 'secondary'} className="text-xs">{m.status}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="breaches" className="mt-4">
          {breaches.length === 0 ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground justify-center" data-testid="text-no-breaches">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm">No threshold breaches recorded</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {breaches.map((b, i) => (
                <div key={i} className="flex items-center gap-3 text-sm bg-red-50 dark:bg-red-950/20 border border-red-200 rounded px-3 py-2" data-testid={`breach-row-${i}`}>
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                  <span className="font-medium capitalize">{b.channel}</span>
                  <Badge variant="destructive" className="text-[10px]">{b.breachType}</Badge>
                  {b.recipientId && <span className="text-muted-foreground text-xs">→ {b.recipientId}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(b.timestamp).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
