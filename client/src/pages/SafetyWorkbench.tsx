export default function SafetyWorkbench() {
  return (
    <div className="p-6 space-y-4" data-testid="safety-workbench">
      <h1 className="text-3xl font-semibold">Safety</h1>
      <p className="text-gray-500">
        HIPAA compliance, PHI protection, audit trails, and SaMD safety monitoring live here.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Audit Reports", href: "/audit-reports" },
          { label: "SaMD Compliance", href: "/samd-compliance" },
          { label: "PHI Protection", href: "/phi-protection" },
          { label: "Release Governance", href: "/release-governance" },
          { label: "Coercion Audit", href: "/coercion-audit" },
          { label: "Shadow Mode Ops", href: "/shadow-mode-ops" },
        ].map(({ label, href }) => (
          <a
            key={href}
            href={href}
            className="rounded-2xl border p-4 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
            data-testid={`safety-link-${label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <div className="font-medium">{label}</div>
            <div className="text-sm text-gray-400 mt-1">{href}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
