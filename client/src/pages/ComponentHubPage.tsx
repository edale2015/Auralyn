import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RefreshCw, Search, Brain, Layers, Users, Plug, BarChart3,
  CheckCircle2, AlertCircle, CircleDashed, Clock, Zap, ShieldCheck,
  Wifi, WifiOff, AlertTriangle, Database, Bot, Cpu, Activity,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    connected:     { label: "Connected",     className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
    live:          { label: "Live",          className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
    enabled:       { label: "Enabled",       className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
    fresh:         { label: "Active",        className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
    active:        { label: "Active",        className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
    embedded:      { label: "Embedded",      className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
    unconfigured:  { label: "Not Configured", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
    stale:         { label: "Stale",         className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
    stub:          { label: "Stub",          className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
    planned:       { label: "Planned",       className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
    disabled:      { label: "Disabled",      className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
    error:         { label: "Error",         className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
    ghost:         { label: "Ghost",         className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
    open:          { label: "Open",          className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
    closed:        { label: "Closed",        className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
    half_open:     { label: "Half-Open",     className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  };
  const cfg = map[status] ?? { label: status, className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.className}`}>{cfg.label}</span>;
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: number | string; sub?: string; color: string }) {
  return (
    <Card className="border-border/60">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">{value}</p>
            <p className="text-sm font-medium mt-1">{label}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceIcon({ id }: { id: string }) {
  const icons: Record<string, string> = {
    openai: "🤖", telegram: "✈️", whatsapp: "💬", redis: "🗄️", langchain: "⛓️", postgres: "🐘",
  };
  return <span className="text-xl">{icons[id] ?? "🔌"}</span>;
}

export default function ComponentHubPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const { toast } = useToast();

  const sysMap = useQuery({ queryKey: ["/api/intel/system-map"] });
  const engines = useQuery({ queryKey: ["/api/intel/engines"] });
  const agents = useQuery({ queryKey: ["/api/intel/agents/vitality"] });
  const skills = useQuery({ queryKey: ["/api/intel/skills"] });
  const services = useQuery({ queryKey: ["/api/intel/connected-services"] });
  const slos = useQuery({ queryKey: ["/api/compliance/slos"] });

  const isLoading = sysMap.isLoading || engines.isLoading || agents.isLoading || skills.isLoading || services.isLoading;

  function refreshAll() {
    [sysMap, engines, agents, skills, services, slos].forEach(q => q.refetch());
    toast({ title: "Refreshed", description: "All component data updated." });
  }

  const enginesData = engines.data as any;
  const agentsData = agents.data as any;
  const skillsData = skills.data as any;
  const servicesData = services.data as any;
  const slosData = slos.data as any;
  const mapData = sysMap.data as any;

  const circuitBreakers: Array<{ name: string; state: string; errorRate?: number }> = useMemo(() => {
    const cbs = mapData?.circuitBreakers ?? {};
    return Object.entries(cbs).map(([name, val]: [string, any]) => ({
      name,
      state: val?.state ?? "closed",
      errorRate: val?.errorRate,
    }));
  }, [mapData]);

  const filteredEngines = useMemo(() => {
    const scheduled = (enginesData?.scheduled ?? []) as string[];
    if (!search) return scheduled;
    return scheduled.filter((e: string) => e.toLowerCase().includes(search.toLowerCase()));
  }, [enginesData, search]);

  const filteredSkills = useMemo(() => {
    const list = (skillsData?.skills ?? []) as any[];
    if (!search) return list;
    return list.filter((s: any) =>
      s.skillName?.toLowerCase().includes(search.toLowerCase()) ||
      s.skillId?.toLowerCase().includes(search.toLowerCase()) ||
      s.category?.toLowerCase().includes(search.toLowerCase())
    );
  }, [skillsData, search]);

  const filteredServices = useMemo(() => {
    const list = (servicesData?.services ?? []) as any[];
    if (!search) return list;
    return list.filter((s: any) => s.name?.toLowerCase().includes(search.toLowerCase()));
  }, [servicesData, search]);

  const filteredCBs = useMemo(() => {
    if (!search) return circuitBreakers;
    return circuitBreakers.filter(cb => cb.name.toLowerCase().includes(search.toLowerCase()));
  }, [circuitBreakers, search]);

  const filteredSLOs = useMemo(() => {
    const list = (slosData?.slos ?? []) as any[];
    if (!search) return list;
    return list.filter((s: any) =>
      s.slo?.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.slo?.id?.toLowerCase().includes(search.toLowerCase())
    );
  }, [slosData, search]);

  const openBreakers = circuitBreakers.filter(cb => cb.state === "open").length;
  const breachedSLOs = (slosData?.slos ?? []).filter((s: any) => s.breached).length;

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Component Hub</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Monitor, inspect, and manage every engine, agent, skill, and connected service in one place.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="input-search"
              placeholder="Search components…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 w-56"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={isLoading}
            data-testid="button-refresh-all"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh All
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Cpu} label="Engines" value={enginesData?.scheduledCount ?? "—"}
          sub={`${enginesData?.discoveredCount ?? 0} discovered`} color="bg-blue-50 text-blue-600 dark:bg-blue-900/30" />
        <StatCard icon={Bot} label="Agents" value={agentsData?.total ?? "—"}
          sub={`${agentsData?.fresh ?? 0} active`} color="bg-purple-50 text-purple-600 dark:bg-purple-900/30" />
        <StatCard icon={Layers} label="Skills" value={skillsData?.total ?? "—"}
          sub={`${skillsData?.enabled ?? 0} enabled`} color="bg-teal-50 text-teal-600 dark:bg-teal-900/30" />
        <StatCard icon={Plug} label="Services" value={servicesData?.total ?? "—"}
          sub={`${servicesData?.connected ?? 0} connected`} color="bg-orange-50 text-orange-600 dark:bg-orange-900/30" />
        <StatCard icon={Zap} label="Breakers Open" value={openBreakers}
          sub={`${circuitBreakers.length} total`} color={openBreakers > 0 ? "bg-red-50 text-red-600 dark:bg-red-900/30" : "bg-green-50 text-green-600 dark:bg-green-900/30"} />
        <StatCard icon={BarChart3} label="SLOs Breached" value={breachedSLOs}
          sub={`${(slosData?.slos ?? []).length} total`} color={breachedSLOs > 0 ? "bg-red-50 text-red-600 dark:bg-red-900/30" : "bg-green-50 text-green-600 dark:bg-green-900/30"} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="engines" data-testid="tab-engines">Engines ({enginesData?.scheduledCount ?? 0})</TabsTrigger>
          <TabsTrigger value="agents" data-testid="tab-agents">Agents ({agentsData?.total ?? 0})</TabsTrigger>
          <TabsTrigger value="skills" data-testid="tab-skills">Skills ({skillsData?.total ?? 0})</TabsTrigger>
          <TabsTrigger value="services" data-testid="tab-services">Connected Services</TabsTrigger>
          <TabsTrigger value="breakers" data-testid="tab-breakers">Circuit Breakers ({circuitBreakers.length})</TabsTrigger>
          <TabsTrigger value="slos" data-testid="tab-slos">SLOs ({(slosData?.slos ?? []).length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(servicesData?.services ?? []).map((svc: any) => (
              <Card key={svc.id} className="border-border/60" data-testid={`card-service-${svc.id}`}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-3">
                    <ServiceIcon id={svc.id} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{svc.name}</span>
                        <StatusBadge status={svc.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{svc.detail}</p>
                      {svc.latencyMs != null && (
                        <p className="text-xs text-muted-foreground">{svc.latencyMs}ms</p>
                      )}
                    </div>
                    {svc.status === "connected" ? (
                      <Wifi className="h-4 w-4 text-green-500 shrink-0" />
                    ) : svc.status === "embedded" ? (
                      <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0" />
                    ) : svc.status === "unconfigured" ? (
                      <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-red-500 shrink-0" />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {openBreakers > 0 && (
            <Card className="border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> {openBreakers} Circuit Breaker{openBreakers > 1 ? "s" : ""} Open
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="flex flex-wrap gap-2">
                  {circuitBreakers.filter(cb => cb.state === "open").map(cb => (
                    <span key={cb.name} className="px-2 py-1 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 rounded text-xs font-mono">
                      {cb.name}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {breachedSLOs > 0 && (
            <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-900/10">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> {breachedSLOs} SLO{breachedSLOs > 1 ? "s" : ""} Breached
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="flex flex-wrap gap-2">
                  {(slosData?.slos ?? []).filter((s: any) => s.breached).map((s: any) => (
                    <span key={s.slo.id} className="px-2 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 rounded text-xs">
                      {s.slo.name}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {openBreakers === 0 && breachedSLOs === 0 && (
            <Card className="border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                  <div>
                    <p className="font-semibold text-green-700 dark:text-green-400">All systems nominal</p>
                    <p className="text-sm text-muted-foreground">No open circuit breakers or breached SLOs.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-3 gap-4">
            <Card className="border-border/60">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Engine Coverage</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="text-3xl font-bold">{enginesData?.coveragePct ?? 0}%</div>
                <p className="text-xs text-muted-foreground mt-1">{enginesData?.scheduledCount} scheduled / {enginesData?.discoveredCount} discovered</p>
                <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${enginesData?.coveragePct ?? 0}%` }} />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent Health</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="text-3xl font-bold text-green-600">{agentsData?.fresh ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Active · {agentsData?.stale ?? 0} stale · {agentsData?.ghost ?? 0} ghost</p>
                <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                  <div className="bg-green-500 h-1.5 rounded-full"
                    style={{ width: agentsData?.total ? `${Math.round((agentsData.fresh / agentsData.total) * 100)}%` : "0%" }} />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Skill Enablement</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="text-3xl font-bold text-teal-600">{skillsData?.enabled ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Enabled · {skillsData?.disabled ?? 0} disabled</p>
                <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                  <div className="bg-teal-500 h-1.5 rounded-full"
                    style={{ width: skillsData?.total ? `${Math.round((skillsData.enabled / skillsData.total) * 100)}%` : "0%" }} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="engines" className="mt-4">
          <Card className="border-border/60">
            <CardHeader className="pb-3 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  Scheduled Engines &nbsp;
                  <span className="text-muted-foreground font-normal">({filteredEngines.length} shown)</span>
                </CardTitle>
                <Badge variant="outline">{enginesData?.unscheduledCount ?? 0} unscheduled</Badge>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              {engines.isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {filteredEngines.map((name: string) => (
                    <div key={name} data-testid={`engine-item-${name}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 text-sm">
                      <Cpu className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <span className="truncate font-mono text-xs">{name}</span>
                    </div>
                  ))}
                </div>
              )}
              {(enginesData?.unscheduledCount ?? 0) > 0 && (
                <details className="mt-4">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    {enginesData.unscheduledCount} unscheduled / discovered-only engines
                  </summary>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 mt-2">
                    {(enginesData?.unscheduled ?? []).map((name: string) => (
                      <div key={name} className="flex items-center gap-2 px-3 py-2 rounded-md bg-yellow-50 dark:bg-yellow-900/10 text-sm">
                        <CircleDashed className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                        <span className="truncate font-mono text-xs">{name}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agents" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Card className="border-green-200 bg-green-50/50 dark:bg-green-900/10">
              <CardContent className="pt-3 pb-3 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div><p className="text-xl font-bold text-green-700 dark:text-green-400">{agentsData?.fresh ?? 0}</p><p className="text-xs text-muted-foreground">Active</p></div>
              </CardContent>
            </Card>
            <Card className="border-yellow-200 bg-yellow-50/50 dark:bg-yellow-900/10">
              <CardContent className="pt-3 pb-3 flex items-center gap-3">
                <Clock className="h-5 w-5 text-yellow-600" />
                <div><p className="text-xl font-bold text-yellow-700 dark:text-yellow-400">{agentsData?.stale ?? 0}</p><p className="text-xs text-muted-foreground">Stale (no heartbeat)</p></div>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50/50 dark:bg-red-900/10">
              <CardContent className="pt-3 pb-3 flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <div><p className="text-xl font-bold text-red-700 dark:text-red-400">{agentsData?.ghost ?? 0}</p><p className="text-xs text-muted-foreground">Ghost (no record)</p></div>
              </CardContent>
            </Card>
          </div>
          <Card className="border-border/60">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold">Configured Agents</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {agents.isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {Object.entries((mapData?.agents?.configured ?? {}) as Record<string, any>)
                    .filter(([name]) => !search || name.toLowerCase().includes(search.toLowerCase()))
                    .map(([name, cfg]) => (
                      <div key={name} data-testid={`agent-item-${name}`}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-muted/50">
                        <div className="flex items-center gap-2 min-w-0">
                          <Bot className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                          <span className="truncate text-xs font-mono">{name}</span>
                        </div>
                        <StatusBadge status={cfg.enabled ? "active" : "disabled"} />
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="skills" className="mt-4">
          <Card className="border-border/60">
            <CardHeader className="pb-3 pt-4">
              <CardTitle className="text-sm font-semibold">
                Skills &nbsp;
                <span className="text-muted-foreground font-normal">({filteredSkills.length} shown)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {skills.isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</div>
              ) : (
                <div className="space-y-1.5">
                  {filteredSkills.map((s: any) => (
                    <div key={s.skillId} data-testid={`skill-item-${s.skillId}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-muted/50">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Layers className="h-3.5 w-3.5 text-teal-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{s.skillName}</p>
                          <p className="text-xs text-muted-foreground">{s.skillId} · {s.category} · {s.safetyClass} safety</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {s.passRate != null && (
                          <span className="text-xs text-muted-foreground">{Math.round(s.passRate * 100)}% pass</span>
                        )}
                        <StatusBadge status={s.enabled ? "enabled" : "disabled"} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services" className="mt-4">
          <Card className="border-border/60">
            <CardHeader className="pb-3 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Connected Services</CardTitle>
                {servicesData?.checkedAt && (
                  <span className="text-xs text-muted-foreground">Checked {new Date(servicesData.checkedAt).toLocaleTimeString()}</span>
                )}
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              {services.isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> Pinging services…</div>
              ) : (
                <div className="space-y-3">
                  {filteredServices.map((svc: any) => (
                    <div key={svc.id} data-testid={`service-item-${svc.id}`}
                      className="flex items-center gap-4 px-4 py-3 rounded-lg border border-border/60 bg-card">
                      <ServiceIcon id={svc.id} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{svc.name}</span>
                          <StatusBadge status={svc.status} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{svc.detail}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {svc.latencyMs != null ? (
                          <span className="text-sm font-mono text-muted-foreground">{svc.latencyMs}ms</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                      {svc.status === "connected" ? (
                        <Wifi className="h-5 w-5 text-green-500" />
                      ) : svc.status === "embedded" ? (
                        <CheckCircle2 className="h-5 w-5 text-blue-500" />
                      ) : svc.status === "unconfigured" ? (
                        <AlertTriangle className="h-5 w-5 text-yellow-500" />
                      ) : (
                        <WifiOff className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 mt-4">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold text-muted-foreground">How to configure a service</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" /><span><strong>OpenAI / ChatGPT</strong> — Set <code className="bg-muted px-1 rounded text-xs">AI_INTEGRATIONS_OPENAI_API_KEY</code> in Secrets</span></li>
                <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" /><span><strong>Telegram</strong> — Set <code className="bg-muted px-1 rounded text-xs">TELEGRAM_BOT_TOKEN</code> in Secrets (from @BotFather)</span></li>
                <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" /><span><strong>WhatsApp</strong> — Set <code className="bg-muted px-1 rounded text-xs">TWILIO_ACCOUNT_SID</code> + <code className="bg-muted px-1 rounded text-xs">TWILIO_AUTH_TOKEN</code> in Secrets</span></li>
                <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" /><span><strong>Redis</strong> — Managed via Upstash — credentials already configured</span></li>
                <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" /><span><strong>LangChain</strong> — Embedded library, no external credentials needed</span></li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakers" className="mt-4">
          <Card className="border-border/60">
            <CardHeader className="pb-3 pt-4">
              <CardTitle className="text-sm font-semibold">
                Circuit Breakers &nbsp;
                <span className="text-muted-foreground font-normal">({filteredCBs.length} shown)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {sysMap.isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</div>
              ) : filteredCBs.length === 0 ? (
                <div className="flex items-center gap-3 py-4 text-muted-foreground">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span>No circuit breakers registered yet.</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredCBs.map(cb => (
                    <div key={cb.name} data-testid={`breaker-item-${cb.name}`}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md bg-muted/50">
                      <div className="flex items-center gap-2 min-w-0">
                        <Zap className={`h-4 w-4 shrink-0 ${cb.state === "open" ? "text-red-500" : "text-green-500"}`} />
                        <span className="font-mono text-sm truncate">{cb.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {cb.errorRate != null && (
                          <span className="text-xs text-muted-foreground">{(cb.errorRate * 100).toFixed(1)}% err</span>
                        )}
                        <StatusBadge status={cb.state} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="slos" className="mt-4">
          <Card className="border-border/60">
            <CardHeader className="pb-3 pt-4">
              <CardTitle className="text-sm font-semibold">
                Clinical SLOs &nbsp;
                <span className="text-muted-foreground font-normal">({filteredSLOs.length} shown)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {slos.isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</div>
              ) : (
                <div className="space-y-1.5">
                  {filteredSLOs.map((entry: any) => {
                    const s = entry.slo;
                    return (
                      <div key={s.id} data-testid={`slo-item-${s.id}`}
                        className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-md ${entry.breached ? "bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800" : "bg-muted/50"}`}>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <ShieldCheck className={`h-4 w-4 shrink-0 ${entry.breached ? "text-red-500" : "text-green-500"}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{s.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{s.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {s.category && <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{s.category}</span>}
                          <span className="text-xs text-muted-foreground">target: {s.higherIsBetter ? "≥" : "≤"}{s.target}</span>
                          <StatusBadge status={entry.breached ? "error" : "live"} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
