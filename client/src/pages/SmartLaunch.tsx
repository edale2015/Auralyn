export default function SmartLaunch() {
  const epicISS = "https://fhir.epic.com/interconnect-fhir-oauth";

  function launch() {
    window.location.href = `/api/smart/launch?iss=${encodeURIComponent(epicISS)}`;
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full text-center space-y-4">
        <div className="text-5xl">🏥</div>
        <h1 className="text-white text-2xl font-bold">Connect to Epic EHR</h1>
        <p className="text-gray-400 text-sm">
          Launch this app via Epic's SMART on FHIR protocol to securely access
          patient records and write clinical triage results back to the EHR.
        </p>
        <div className="bg-gray-800 rounded-lg p-3 text-left text-xs font-mono text-gray-400 break-all">
          {epicISS}
        </div>
        <button
          onClick={launch}
          data-testid="button-epic-launch"
          className="w-full py-3 bg-blue-700 hover:bg-blue-600 text-white rounded-xl font-semibold text-sm"
        >
          Launch SMART App
        </button>
        <p className="text-gray-600 text-xs">
          Requires Epic instance configuration. Contact your IT team to enable SMART on FHIR.
        </p>
      </div>
    </div>
  );
}
