import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

const ROLES = ["admin", "physician", "staff"] as const;
type Role = typeof ROLES[number];

const ACTIONS: Record<Role, string[]> = {
  admin:     ["deploy", "override", "alerts", "view", "manage_tenants"],
  physician: ["override", "view", "triage"],
  staff:     ["view", "triage"],
};

export default function AdminPanel() {
  const [role, setRole] = useState<Role>("admin");
  const { toast } = useToast();

  const { data: tenants } = useQuery<{ tenants: string[] }>({
    queryKey: ["/api/tenants"],
  });

  async function runAction(action: string) {
    const perms = ACTIONS[role];
    if (!perms.includes(action)) {
      toast({ title: "Forbidden", description: `Role '${role}' cannot '${action}'`, variant: "destructive" });
      return;
    }
    toast({ title: `Action: ${action}`, description: `Executed as ${role}` });
  }

  async function broadcastAlert() {
    await fetch("/api/monitoring/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg: `Admin broadcast from ${role}` }),
    });
    toast({ title: "Broadcast sent", description: "Slack + WhatsApp + Telegram" });
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <h1 className="text-2xl font-bold mb-1">🧑‍💼 Admin Console</h1>
      <p className="text-gray-400 text-sm mb-6">Multi-tenant RBAC — switch roles to see permission gates.</p>

      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm text-gray-400">Active Role:</span>
        {ROLES.map(r => (
          <button
            key={r}
            onClick={() => setRole(r)}
            data-testid={`button-role-${r}`}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              role === r
                ? "bg-indigo-700 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <p className="text-xs text-gray-400 mb-2">Permissions for <span className="text-white font-medium">{role}</span></p>
        <div className="flex flex-wrap gap-2">
          {ACTIONS[role].map(p => (
            <span key={p} className="px-2 py-0.5 bg-indigo-900/60 border border-indigo-700 rounded text-xs text-indigo-300">
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { action: "deploy",          label: "🚀 Deploy",          color: "bg-blue-800 hover:bg-blue-700" },
          { action: "override",        label: "⚡ Override",        color: "bg-orange-800 hover:bg-orange-700" },
          { action: "alerts",          label: "🚨 Manage Alerts",   color: "bg-red-800 hover:bg-red-700" },
          { action: "manage_tenants",  label: "🏢 Manage Tenants",  color: "bg-purple-800 hover:bg-purple-700" },
        ].map(({ action, label, color }) => (
          <button
            key={action}
            onClick={() => runAction(action)}
            data-testid={`button-action-${action}`}
            className={`${color} text-white py-3 rounded-lg font-medium text-sm transition-colors`}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        onClick={broadcastAlert}
        data-testid="button-broadcast-alert"
        className="w-full py-3 bg-yellow-700 hover:bg-yellow-600 rounded-lg font-medium text-sm text-white transition-colors mb-6"
      >
        📡 Broadcast Alert (All Channels)
      </button>

      {tenants?.tenants && (
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-2">Registered Tenants</p>
          <div className="flex flex-wrap gap-2">
            {tenants.tenants.map(t => (
              <span key={t} data-testid={`tenant-badge-${t}`} className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-300">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
