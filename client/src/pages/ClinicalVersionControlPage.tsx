import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { GitBranch, Plus, Clock, History } from "lucide-react";
import VersionList from "@/components/versioning/VersionList";
import VersionDiffViewer from "@/components/versioning/VersionDiffViewer";
import VersionRollbackPanel from "@/components/versioning/VersionRollbackPanel";

function PanelVersionHistory() {
  const { toast } = useToast();
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/clinical-versions"],
  });

  const deployMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", "/api/clinical-versions/deploy", { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinical-versions"] });
      toast({ title: "Version deployed successfully" });
    },
    onError: () => toast({ title: "Deploy failed", variant: "destructive" }),
  });

  const rollbackMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", "/api/clinical-versions/rollback", { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinical-versions"] });
      toast({ title: "Rollback completed" });
    },
    onError: () => toast({ title: "Rollback failed", variant: "destructive" }),
  });

  function handleSelect(id: string) {
    setSelectedVersions((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            Version History
            {data?.summary && (
              <Badge variant="outline" className="ml-2 text-xs">{data.summary.totalVersions} versions</Badge>
            )}
          </h3>
          {selectedVersions.length === 2 && (
            <Badge variant="secondary" className="text-xs">Comparing {selectedVersions.length} versions</Badge>
          )}
        </div>
        {isLoading && <p className="text-muted-foreground text-sm">Loading versions...</p>}
        <VersionList
          versions={data?.versions || []}
          onDeploy={(id) => deployMutation.mutate(id)}
          onRollback={(id) => rollbackMutation.mutate(id)}
          onSelect={handleSelect}
          selectedId={selectedVersions[selectedVersions.length - 1]}
          deploying={deployMutation.isPending || rollbackMutation.isPending}
        />
      </div>
      <div className="space-y-4">
        <VersionDiffViewer
          fromId={selectedVersions[0] || ""}
          toId={selectedVersions[1] || ""}
        />
      </div>
    </div>
  );
}

function PanelCreateVersion() {
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/clinical-versions", {
        description: description || "Manual version snapshot",
        files: files ? files.split(",").map((f) => f.trim()) : [],
        summary: { added: 0, removed: 0, modified: 0, sheets: [], details: description },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinical-versions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clinical-change-timeline"] });
      toast({ title: "Version created" });
      setDescription("");
      setFiles("");
    },
    onError: () => toast({ title: "Failed to create version", variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="w-5 h-5" />Create Version Snapshot
        </CardTitle>
        <CardDescription>
          Capture the current state of clinical configuration as a versioned snapshot
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Description</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Updated dizziness stroke protocol, added chest pain red flags..."
            data-testid="input-version-description"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Sheet Files (comma-separated, optional)</label>
          <Input
            value={files}
            onChange={(e) => setFiles(e.target.value)}
            placeholder="COMPLAINT_REGISTRY, CORE_QUESTIONS, DISPOSITION_RULES"
            data-testid="input-version-files"
          />
        </div>
        <Button
          onClick={() => create.mutate()}
          disabled={create.isPending}
          data-testid="button-create-version"
        >
          {create.isPending ? "Creating..." : "Create Version"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PanelTimeline() {
  const { data: timeline, isLoading } = useQuery<any[]>({
    queryKey: ["/api/clinical-change-timeline"],
  });

  const { data: deployment } = useQuery<any>({
    queryKey: ["/api/clinical-versions/deployment/current"],
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />Clinical Change Timeline
            </CardTitle>
            <CardDescription>Chronological history of all clinical configuration changes</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && <p className="text-muted-foreground text-sm">Loading timeline...</p>}

            {(!timeline || timeline.length === 0) && !isLoading && (
              <p className="text-muted-foreground text-sm" data-testid="text-empty-timeline">
                No clinical changes recorded yet. Create a version to start tracking changes.
              </p>
            )}

            {timeline && timeline.length > 0 && (
              <div className="relative" data-testid="timeline-container">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                {timeline.map((entry: any, i: number) => (
                  <div key={entry.version} className="relative pl-10 pb-6" data-testid={`timeline-entry-${i}`}>
                    <div className="absolute left-2.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{entry.version}</span>
                        <Badge
                          variant={entry.status === "deployed" ? "default" : entry.status === "rolled_back" ? "destructive" : "outline"}
                          className="text-xs"
                        >
                          {entry.status}
                        </Badge>
                      </div>
                      <p className="text-sm">{entry.description}</p>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span><Clock className="w-3 h-3 inline mr-1" />{new Date(entry.time).toLocaleString()}</span>
                        <span>by {entry.createdBy}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <div>
        <VersionRollbackPanel deploymentInfo={deployment} />
      </div>
    </div>
  );
}

export default function ClinicalVersionControlPage() {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <GitBranch className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-cvcs-title">Clinical Version Control</h1>
          <p className="text-muted-foreground text-sm">
            Track, compare, deploy, and rollback clinical configuration versions safely
          </p>
        </div>
      </div>

      <Tabs defaultValue="history" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="history" data-testid="tab-cvcs-history">
            <GitBranch className="w-4 h-4 mr-1" />Version History
          </TabsTrigger>
          <TabsTrigger value="create" data-testid="tab-cvcs-create">
            <Plus className="w-4 h-4 mr-1" />Create Version
          </TabsTrigger>
          <TabsTrigger value="timeline" data-testid="tab-cvcs-timeline">
            <History className="w-4 h-4 mr-1" />Timeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-6">
          <PanelVersionHistory />
        </TabsContent>
        <TabsContent value="create" className="mt-6">
          <PanelCreateVersion />
        </TabsContent>
        <TabsContent value="timeline" className="mt-6">
          <PanelTimeline />
        </TabsContent>
      </Tabs>
    </div>
  );
}
