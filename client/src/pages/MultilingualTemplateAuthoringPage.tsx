import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import PageShell from "@/components/PageShell"
import PatientLanguagePanel from "@/components/PatientLanguagePanel"
import SectionHeader from "@/components/SectionHeader"
import EmptyState from "@/components/EmptyState"
import { useToast } from "@/hooks/use-toast"

type Template = {
  id: string
  key: string
  category: string
  lang: string
  text: string
  variables: string[]
  createdAt: string
}

export default function MultilingualTemplateAuthoringPage() {
  const [filterLang, setFilterLang] = useState("")
  const [filterCat, setFilterCat] = useState("")
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ key: "", category: "", lang: "en", text: "" })
  const qc = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ["/api/multilingual-templates", filterLang, filterCat],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filterLang) params.set("lang", filterLang)
      if (filterCat) params.set("category", filterCat)
      return fetch(`/api/multilingual-templates?${params}`).then((r) => r.json())
    },
    refetchInterval: 15000,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      fetch("/api/multilingual-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, createdBy: "ui" }),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.ok) {
        toast({ title: "Template created" })
        setForm({ key: "", category: "", lang: "en", text: "" })
        setCreating(false)
        qc.invalidateQueries({ queryKey: ["/api/multilingual-templates"] })
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/multilingual-templates/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Template deleted" })
      qc.invalidateQueries({ queryKey: ["/api/multilingual-templates"] })
    },
  })

  const templates: Template[] = data?.templates ?? []
  const langs: string[] = data?.langs ?? []
  const categories: string[] = data?.categories ?? []

  return (
    <PageShell
      title="Multilingual Template Authoring"
      description="Create, edit, and auto-translate patient-facing templates across languages"
      actions={
        <Button size="sm" onClick={() => setCreating(true)} disabled={creating}>
          + New Template
        </Button>
      }
    >
      {/* Live translation tool */}
      <section>
        <SectionHeader title="Translation Sandbox" description="Preview translations in real time" />
        <div className="border rounded-xl p-4 bg-card max-w-xl">
          <PatientLanguagePanel />
        </div>
      </section>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        <select
          className="text-xs border rounded px-2 py-1.5 bg-background"
          value={filterLang}
          onChange={(e) => setFilterLang(e.target.value)}
        >
          <option value="">All languages</option>
          {langs.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select
          className="text-xs border rounded px-2 py-1.5 bg-background"
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(filterLang || filterCat) && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setFilterLang(""); setFilterCat("") }}>
            Clear
          </Button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div className="border rounded-xl p-4 bg-card space-y-3">
          <p className="text-sm font-medium">New Template</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Input placeholder="Key (e.g. greeting)" className="text-xs h-8" value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} />
            <Input placeholder="Category" className="text-xs h-8" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
            <select className="text-xs border rounded px-2 bg-background" value={form.lang} onChange={(e) => setForm((f) => ({ ...f, lang: e.target.value }))}>
              {["en", "es", "pt", "fr", "ar", "zh", "hi"].map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <textarea
            className="w-full text-sm border rounded p-2 resize-none"
            rows={3}
            placeholder="Template text…"
            value={form.text}
            onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.key || !form.category || !form.text}>
              {createMutation.isPending ? "Creating…" : "Create"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Template list */}
      <section>
        <SectionHeader title={`Templates (${templates.length})`} />
        {isLoading ? (
          <div className="animate-pulse h-24 bg-muted rounded-xl" />
        ) : templates.length === 0 ? (
          <EmptyState title="No templates" description="Create your first template above." />
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="border rounded-xl px-4 py-3 bg-card flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-xs font-medium">{t.key}</span>
                    <Badge variant="outline" className="text-[10px]">{t.lang}</Badge>
                    <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.text}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-red-600 shrink-0"
                  onClick={() => deleteMutation.mutate(t.id)}
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  )
}
