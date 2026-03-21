import { useEffect, useState } from "react";

export default function DependencyHealthMap() {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dependencies")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6" data-testid="deps-loading">Loading dependency health...</div>;
  }

  if (!data) {
    return <div className="p-6 text-red-600">Failed to load dependencies</div>;
  }

  const entries = Object.entries(data);

  return (
    <div className="p-6 space-y-6" data-testid="dependency-health-map">
      <h1 className="text-3xl font-semibold">Dependency Health Map</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {entries.map(([name, value]) => (
          <div
            key={name}
            className="rounded-2xl border p-4 shadow-sm bg-white dark:bg-gray-900 dark:border-gray-700"
            data-testid={`dep-card-${name}`}
          >
            <div className="text-lg font-medium capitalize">{name}</div>
            <div className={`mt-2 font-semibold ${value.ok ? "text-green-600" : "text-red-600"}`}>
              {value.ok ? "✓ OK" : "✗ FAIL"}
            </div>
            {value.error ? (
              <div className="text-sm text-red-500 mt-2">{value.error}</div>
            ) : null}
            {value.note ? (
              <div className="text-sm text-gray-500 mt-2">{value.note}</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
