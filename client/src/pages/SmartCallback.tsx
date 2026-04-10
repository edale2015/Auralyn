import { useEffect, useState } from "react";

export default function SmartCallback() {
  const [status, setStatus] = useState<"connecting" | "success" | "error">("connecting");

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");

    if (!code) {
      setStatus("error");
      return;
    }

    fetch("/api/smart/callback?code=" + encodeURIComponent(code))
      .then(r => r.json())
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full text-center space-y-4">
        <div className="text-5xl">
          {status === "connecting" ? "🔄" : status === "success" ? "✅" : "❌"}
        </div>
        <h1 className="text-white text-xl font-bold">
          {status === "connecting" && "Connecting to Epic…"}
          {status === "success"    && "Connected to Epic!"}
          {status === "error"      && "Connection Failed"}
        </h1>
        <p className="text-gray-400 text-sm" data-testid="smart-callback-status">
          {status === "connecting" && "Exchanging authorization code for access token…"}
          {status === "success"    && "Your SMART on FHIR session is active. You can close this window."}
          {status === "error"      && "No authorization code found or server error. Please try launching again."}
        </p>
        {status !== "connecting" && (
          <a
            href="/smart-launch"
            data-testid="link-smart-retry"
            className="inline-block mt-2 px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-sm rounded-lg"
          >
            Return to Epic Connect
          </a>
        )}
      </div>
    </div>
  );
}
