export default function SettingsWorkbench() {
  return (
    <div className="p-6 space-y-4" data-testid="settings-workbench">
      <h1 className="text-3xl font-semibold">Settings</h1>
      <p className="text-gray-500">
        Site management, organizations, roles, and system configuration live here.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Organizations", href: "/organizations" },
          { label: "Site Management", href: "/site-management" },
          { label: "Formularly Admin", href: "/formulary-admin" },
          { label: "Role Auth", href: "/role-auth" },
          { label: "Agent Control Panel", href: "/agent-control-panel" },
          { label: "Notifications", href: "/notifications" },
        ].map(({ label, href }) => (
          <a
            key={href}
            href={href}
            className="rounded-2xl border p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            data-testid={`settings-link-${label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <div className="font-medium">{label}</div>
            <div className="text-sm text-gray-400 mt-1">{href}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
