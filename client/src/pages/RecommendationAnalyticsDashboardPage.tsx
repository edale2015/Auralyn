import { useQuery } from "@tanstack/react-query"
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import PageShell from "@/components/PageShell"
import SectionHeader from "@/components/SectionHeader"
import AcceptanceSummaryCards from "@/components/AcceptanceSummaryCards"
import TemplateRecommendationsPanel from "@/components/TemplateRecommendationsPanel"
import EmptyState from "@/components/EmptyState"

export default function RecommendationAnalyticsDashboardPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/recommendation-analytics/summary"],
    queryFn: () => fetch("/api/recommendation-analytics/summary").then((r) => r.json()),
    refetchInterval: 15000,
  })

  const summary = data?.summary
  const byCategory = summary?.byCategory
    ? Object.entries(summary.byCategory).map(([cat, v]: [string, any]) => ({
        category: cat,
        used: v.used,
        accepted: v.accepted,
        rate: Math.round(v.rate * 100),
      }))
    : []

  const byComplaint = summary?.byComplaint
    ? Object.entries(summary.byComplaint).map(([complaint, v]: [string, any]) => ({
        complaint,
        count: v.count,
        topTemplate: v.topTemplate,
      }))
    : []

  return (
    <PageShell
      title="Template Recommendation Analytics"
      description="How AI-suggested templates are used, accepted, and rewritten"
    >
      {isLoading ? (
        <div className="animate-pulse h-24 bg-muted rounded-xl" />
      ) : summary?.totalTemplatesUsed === 0 ? (
        <EmptyState
          title="No recommendation data yet"
          description="As doctors use and accept/modify AI-suggested templates, analytics will appear here."
        />
      ) : (
        <>
          <section>
            <SectionHeader title="Top Recommended Templates" />
            <TemplateRecommendationsPanel />
          </section>

          {byCategory.length > 0 && (
            <section>
              <SectionHeader title="Acceptance by Category" />
              <div className="rounded-xl border bg-card p-4">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byCategory}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="used" name="Used" fill="#3b82f6" />
                      <Bar dataKey="accepted" name="Accepted" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          )}

          {byComplaint.length > 0 && (
            <section>
              <SectionHeader title="Usage by Complaint" />
              <div className="rounded-xl border bg-card p-4">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byComplaint}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="complaint" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Interactions" fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </PageShell>
  )
}
