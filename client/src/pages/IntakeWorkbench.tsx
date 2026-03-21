export default function IntakeWorkbench() {
  return (
    <div className="p-6 space-y-4" data-testid="intake-workbench">
      <h1 className="text-3xl font-semibold">Intake</h1>
      <p className="text-gray-500">
        Patient intake flows, complaint packs, and triage routing live here.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Complaint Control Center", href: "/complaint-control-center" },
          { label: "Patient Queue", href: "/patient-queue" },
          { label: "Complaint QA", href: "/complaint-qa" },
          { label: "Pack Builder", href: "/pack-builder" },
          { label: "Pack Simulator", href: "/pack-simulator" },
          { label: "Chat Intake", href: "/chat-intake" },
        ].map(({ label, href }) => (
          <a
            key={href}
            href={href}
            className="rounded-2xl border p-4 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
            data-testid={`intake-link-${label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <div className="font-medium">{label}</div>
            <div className="text-sm text-gray-400 mt-1">{href}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
