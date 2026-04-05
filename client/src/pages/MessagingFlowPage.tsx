import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Send, Smartphone, Search, ChevronRight, Loader2, CheckCircle2, AlertCircle, Copy, ExternalLink, Bot, Hash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Complaint {
  slug: string;
  label: string;
  aliases: string[];
}

interface TelegramFlowResponse {
  complaintSlug: string;
  complaintLabel: string;
  questionCount: number;
  schema: {
    version: string;
    packId: string;
    title: string;
    steps: { id: string; label: string; input: string; options: string[] }[];
  };
  deepLink: string;
}

interface WhatsAppFlowResponse {
  complaintSlug: string;
  complaintLabel: string;
  questionCount: number;
  flow: object;
  twilioFormat: {
    note: string;
    preview: { questionNumber: number; message: string }[];
  };
}

function ComplaintSearch({
  complaints,
  selected,
  onSelect,
}: {
  complaints: Complaint[];
  selected: string | null;
  onSelect: (slug: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = complaints.filter(
    (c) =>
      !q ||
      c.label.toLowerCase().includes(q.toLowerCase()) ||
      c.slug.includes(q.toLowerCase()) ||
      c.aliases.some((a) => a.includes(q.toLowerCase()))
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="input-complaint-search"
          placeholder="Search complaints…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>
      <ScrollArea className="h-[420px] pr-1">
        <div className="space-y-0.5">
          {filtered.map((c) => (
            <button
              key={c.slug}
              data-testid={`btn-complaint-${c.slug}`}
              onClick={() => onSelect(c.slug)}
              className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between transition-colors ${
                selected === c.slug
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted text-foreground"
              }`}
            >
              <span className="truncate">{c.label}</span>
              {selected === c.slug && <ChevronRight className="h-3 w-3 shrink-0" />}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">No complaints match "{q}"</div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function TelegramPreview({ data }: { data: TelegramFlowResponse }) {
  const { toast } = useToast();

  function copyDeepLink() {
    navigator.clipboard.writeText(data.deepLink);
    toast({ title: "Deep link copied" });
  }

  const inputLabels: Record<string, string> = {
    yes_no: "YES / NO buttons",
    single_select: "Tap a number (1–10)",
    free_text: "Free text input",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="gap-1">
          <Bot className="h-3 w-3" />
          Telegram Mini App
        </Badge>
        <Badge variant="secondary">{data.questionCount} questions</Badge>
        <span className="text-xs text-muted-foreground ml-auto">{data.complaintLabel}</span>
      </div>

      <div className="rounded-lg border bg-[#17212b] p-3 space-y-1.5" data-testid="telegram-flow-preview">
        <div className="text-[11px] text-center text-[#6c7883] mb-3">Telegram Bot Preview</div>

        <div className="flex gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-[#5288c1] flex items-center justify-center shrink-0">
            <Bot className="h-3 w-3 text-white" />
          </div>
          <div className="bg-[#232e3c] text-[#aaaaaa] rounded-xl rounded-tl-none px-3 py-2 text-xs max-w-[80%]">
            👋 Hi! I'm the Auralyn triage assistant.<br />
            Tap your main symptom or type it:
          </div>
        </div>

        <div className="flex gap-1 flex-wrap mb-3">
          {["Sore Throat", "Chest Pain", "Cough", "Headache"].map((s) => (
            <span key={s} className="bg-[#2b5278] text-[#79c4f9] text-[10px] px-2 py-0.5 rounded cursor-pointer hover:bg-[#3d6d9e] transition-colors">
              {s}
            </span>
          ))}
        </div>

        {data.schema.steps.slice(0, 3).map((step, i) => (
          <div key={step.id} className="space-y-1 mb-2">
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-[#5288c1] flex items-center justify-center shrink-0">
                <Bot className="h-3 w-3 text-white" />
              </div>
              <div className="bg-[#232e3c] text-[#cdd3d8] rounded-xl rounded-tl-none px-3 py-2 text-xs max-w-[82%]">
                <span className="text-[10px] text-[#5288c1] block mb-0.5">📋 Question {i + 1}</span>
                {step.label}
              </div>
            </div>
            <div className="ml-8 flex gap-1 flex-wrap">
              {step.input === "yes_no" ? (
                <>
                  <span className="bg-[#2b5278] text-[#79c4f9] text-[10px] px-3 py-0.5 rounded border border-[#3d6d9e]">✅ Yes</span>
                  <span className="bg-[#2b5278] text-[#79c4f9] text-[10px] px-3 py-0.5 rounded border border-[#3d6d9e]">❌ No</span>
                </>
              ) : step.input === "single_select" ? (
                <>
                  {["1","2","3","4","5"].map((n) => (
                    <span key={n} className="bg-[#2b5278] text-[#79c4f9] text-[10px] px-2 py-0.5 rounded border border-[#3d6d9e]">{n}</span>
                  ))}
                </>
              ) : (
                <span className="text-[#5c6b7a] text-[10px] italic">Free text…</span>
              )}
            </div>
          </div>
        ))}

        {data.schema.steps.length > 3 && (
          <div className="text-center text-[#5c6b7a] text-[10px] mt-1">
            …and {data.schema.steps.length - 3} more questions
          </div>
        )}
      </div>

      <div className="rounded-lg border p-3 space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Question Types</div>
        <div className="space-y-1">
          {data.schema.steps.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-xs py-0.5">
              <span className="text-foreground truncate pr-2">{s.label.slice(0, 55)}{s.label.length > 55 ? "…" : ""}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">{inputLabels[s.input] ?? s.input}</Badge>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border p-3 space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bot Deep Link</div>
        <div className="flex items-center gap-2">
          <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate" data-testid="text-telegram-deeplink">{data.deepLink}</code>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={copyDeepLink} data-testid="btn-copy-deeplink">
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Share this link with patients to start triage directly in the bot.</p>
      </div>
    </div>
  );
}

function WhatsAppPreview({ data }: { data: WhatsAppFlowResponse }) {
  const { toast } = useToast();

  function copyFlow() {
    navigator.clipboard.writeText(JSON.stringify(data.flow, null, 2));
    toast({ title: "WhatsApp Flow JSON copied" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="gap-1">
          <MessageSquare className="h-3 w-3" />
          WhatsApp (Twilio)
        </Badge>
        <Badge variant="secondary">{data.questionCount} questions</Badge>
        <span className="text-xs text-muted-foreground ml-auto">{data.complaintLabel}</span>
      </div>

      <div className="rounded-lg border bg-[#0b141a] p-3 space-y-1.5" data-testid="whatsapp-flow-preview">
        <div className="text-[11px] text-center text-[#667781] mb-3">WhatsApp Chat Preview</div>

        <div className="flex justify-start mb-2">
          <div className="bg-[#202c33] text-[#e9edef] rounded-xl rounded-tl-none px-3 py-2 text-xs max-w-[85%]">
            👋 Welcome to Auralyn Triage.<br /><br />
            What's your main symptom? Type it or reply with a number:<br /><br />
            <span className="text-[#00a884]">1. Sore Throat<br />2. Chest Pain<br />3. Cough<br />4. Headache</span>
            <br /><span className="text-[#8696a0] text-[10px] italic">Or describe your symptom in your own words.</span>
          </div>
        </div>

        <div className="flex justify-end mb-2">
          <div className="bg-[#005c4b] text-[#e9edef] rounded-xl rounded-tr-none px-3 py-2 text-xs max-w-[60%]">
            sore throat
          </div>
        </div>

        {data.twilioFormat.preview.slice(0, 2).map((p) => (
          <div key={p.questionNumber} className="space-y-1">
            <div className="flex justify-start">
              <div className="bg-[#202c33] text-[#e9edef] rounded-xl rounded-tl-none px-3 py-2 text-xs max-w-[85%] whitespace-pre-line">
                {p.message}
              </div>
            </div>
            <div className="flex justify-end">
              <div className="bg-[#005c4b] text-[#e9edef] rounded-xl rounded-tr-none px-3 py-2 text-xs">
                {p.questionNumber === 1 ? "1" : "2"}
              </div>
            </div>
          </div>
        ))}

        {data.questionCount > 2 && (
          <div className="text-center text-[#667781] text-[10px] mt-1">
            …{data.questionCount - 2} more questions
          </div>
        )}
      </div>

      <div className="rounded-lg border p-3 space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center justify-between">
          <span>WhatsApp Flows JSON (v7.1)</span>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={copyFlow} data-testid="btn-copy-wa-flow">
            <Copy className="h-3 w-3" /> Copy
          </Button>
        </div>
        <ScrollArea className="h-32">
          <pre className="text-[10px] text-muted-foreground bg-muted p-2 rounded overflow-x-auto">
            {JSON.stringify(data.flow, null, 2).slice(0, 800)}…
          </pre>
        </ScrollArea>
        <p className="text-xs text-muted-foreground">{data.twilioFormat.note}</p>
      </div>
    </div>
  );
}

function BotStatusCard({ label, icon: Icon, env, color }: { label: string; icon: any; env: string; color: string }) {
  const isConfigured = env !== "not_set";
  return (
    <div className={`rounded-lg border p-4 flex items-start gap-3 ${isConfigured ? "border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20" : "border-muted"}`}>
      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${isConfigured ? "bg-green-100 dark:bg-green-900/40" : "bg-muted"}`}>
        <Icon className={`h-4 w-4 ${isConfigured ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`} />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {isConfigured ? (
            <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200">Configured</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">Not configured</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isConfigured ? "Bot is active and receiving messages." : `Set the required environment variable to activate.`}
        </p>
      </div>
    </div>
  );
}

export default function MessagingFlowPage() {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("telegram");

  const { data: complaintsData, isLoading: complaintsLoading } = useQuery<{ complaints: Complaint[] }>({
    queryKey: ["/api/intake/complaints"],
  });

  const { data: telegramData, isLoading: telegramLoading } = useQuery<TelegramFlowResponse>({
    queryKey: ["/api/intake/telegram-flow", selectedSlug],
    enabled: !!selectedSlug && activeTab === "telegram",
  });

  const { data: waData, isLoading: waLoading } = useQuery<WhatsAppFlowResponse>({
    queryKey: ["/api/intake/whatsapp-flow", selectedSlug],
    enabled: !!selectedSlug && activeTab === "whatsapp",
  });

  const complaints = complaintsData?.complaints ?? [];

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Messaging Flow Builder
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Preview how the KB-driven question flow looks inside Telegram and WhatsApp for each complaint
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs">
            <Hash className="h-3 w-3" />
            {complaints.length} complaints
          </Badge>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 border-r p-4 flex flex-col gap-3 shrink-0">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select Complaint</div>
          {complaintsLoading ? (
            <div className="flex items-center justify-center h-20"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : (
            <ComplaintSearch complaints={complaints} selected={selectedSlug} onSelect={setSelectedSlug} />
          )}
        </div>

        <div className="flex-1 overflow-auto p-6">
          {!selectedSlug ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <Bot className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <div className="font-medium text-foreground">Select a complaint</div>
                <div className="text-sm text-muted-foreground mt-1">Choose any complaint from the left panel to preview its bot flow</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 w-full max-w-lg">
                <BotStatusCard label="Telegram Bot" icon={Send} env={typeof window !== "undefined" ? "configured" : "not_set"} color="blue" />
                <BotStatusCard label="WhatsApp (Twilio)" icon={Smartphone} env={typeof window !== "undefined" ? "configured" : "not_set"} color="green" />
              </div>

              <Card className="w-full max-w-lg text-left mt-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">How it works</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-2">
                  <div className="flex gap-2">
                    <span className="text-primary font-bold shrink-0">1.</span>
                    <span>Patient texts the bot their symptom or taps a complaint button</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-primary font-bold shrink-0">2.</span>
                    <span>Bot delivers KB questions one at a time with tap-to-answer buttons</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-primary font-bold shrink-0">3.</span>
                    <span>Answers feed directly into the triage engine</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-primary font-bold shrink-0">4.</span>
                    <span>Patient receives disposition + recommendation in the same chat</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="max-w-2xl">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4" data-testid="tabs-platform">
                  <TabsTrigger value="telegram" className="gap-1.5" data-testid="tab-telegram">
                    <Send className="h-3.5 w-3.5" /> Telegram
                  </TabsTrigger>
                  <TabsTrigger value="whatsapp" className="gap-1.5" data-testid="tab-whatsapp">
                    <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                  </TabsTrigger>
                  <TabsTrigger value="schema" className="gap-1.5" data-testid="tab-schema">
                    <Hash className="h-3.5 w-3.5" /> Raw Schema
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="telegram">
                  {telegramLoading ? (
                    <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : telegramData ? (
                    <TelegramPreview data={telegramData} />
                  ) : (
                    <div className="text-center py-8 text-sm text-muted-foreground">No data — select a complaint first</div>
                  )}
                </TabsContent>

                <TabsContent value="whatsapp">
                  {waLoading ? (
                    <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : waData ? (
                    <WhatsAppPreview data={waData} />
                  ) : (
                    <div className="text-center py-8 text-sm text-muted-foreground">No data — select a complaint first</div>
                  )}
                </TabsContent>

                <TabsContent value="schema">
                  {telegramLoading ? (
                    <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : telegramData ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{selectedSlug}</Badge>
                        <Badge variant="secondary">{telegramData.questionCount} questions</Badge>
                      </div>
                      <ScrollArea className="h-[520px]">
                        <div className="space-y-2">
                          {telegramData.schema.steps.map((s, i) => (
                            <div key={s.id} className="border rounded-lg p-3 text-xs space-y-1" data-testid={`schema-question-${i}`}>
                              <div className="flex items-center justify-between">
                                <code className="text-primary font-mono">{s.id}</code>
                                <Badge variant="outline" className="text-[10px]">{s.input}</Badge>
                              </div>
                              <div className="text-foreground">{s.label}</div>
                              {s.options?.length > 0 && (
                                <div className="flex gap-1 flex-wrap mt-1">
                                  {s.options.map((o) => (
                                    <span key={o} className="bg-muted px-1.5 py-0.5 rounded text-[10px] text-muted-foreground">{o}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  ) : null}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
