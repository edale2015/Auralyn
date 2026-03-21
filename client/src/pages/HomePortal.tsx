import { Link } from "wouter";

export default function HomePortal() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-gray-50 dark:bg-gray-950">
      <div className="max-w-3xl w-full rounded-3xl shadow-sm border bg-white dark:bg-gray-900 p-8 space-y-6">
        <h1 className="text-3xl font-semibold" data-testid="home-portal-title">MedScribe Portal</h1>
        <p className="text-gray-600 dark:text-gray-400">
          One entry point for patients and clinicians.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          <Link
            to="/portal/patient"
            className="rounded-2xl border p-6 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors block"
            data-testid="link-patient-portal"
          >
            <div className="text-xl font-medium">Patient Portal</div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Intake, updates, messages, follow-up tasks
            </div>
          </Link>

          <Link
            to="/portal/provider"
            className="rounded-2xl border p-6 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors block"
            data-testid="link-provider-portal"
          >
            <div className="text-xl font-medium">Clinician Portal</div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Operations, review, safety, learning, monitoring
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
