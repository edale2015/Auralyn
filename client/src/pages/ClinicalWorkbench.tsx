export default function ClinicalWorkbench() {
  return (
    <div className="p-6 space-y-4" data-testid="clinical-workbench">
      <h1 className="text-3xl font-semibold">Clinical Review</h1>
      <p className="text-gray-500">
        Clinical review queue, case management, and physician oversight live here.
        Use the navigation or direct links below.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Review Queue", href: "/review" },
          { label: "Case Management", href: "/cases" },
          { label: "Physician Dashboard", href: "/physician-dashboard" },
          { label: "Clinical Validation", href: "/clinical-validation" },
          { label: "Outcome Monitoring", href: "/outcome-monitoring" },
          { label: "Operations Cockpit (Legacy)", href: "/operations-cockpit" },
        ].map(({ label, href }) => (
          <a
            key={href}
            href={href}
            className="rounded-2xl border p-4 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
            data-testid={`clinical-link-${label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <div className="font-medium">{label}</div>
            <div className="text-sm text-gray-400 mt-1">{href}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
