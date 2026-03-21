import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./context/AuthContext";

import AppLayout from "./layouts/AppLayout";
import { ROUTES } from "./routes/routeRegistry";
import { validateRoutes } from "./utils/routeValidator";

import Login from "@/pages/Login";
import PatientIntake from "@/pages/PatientIntake";
import SimpleIntake from "@/pages/SimpleIntake";
import IntakeStatus from "@/pages/IntakeStatus";
import IntakeSummary from "@/pages/IntakeSummary";
import StartVisit from "@/pages/StartVisit";
import ProviderCaseView from "@/pages/ProviderCaseView";
import PatientIntakeChat from "@/pages/PatientIntakeChat";

import OperationsCockpit from "@/pages/OperationsCockpit";
import DependencyHealthMap from "@/pages/DependencyHealthMap";
import EngineMetricsDashboard from "@/pages/EngineMetricsDashboard";
import WorkerMonitor from "@/pages/WorkerMonitor";
import ClinicHealthDashboard from "@/pages/ClinicHealthDashboard";
import ClinicalWorkbench from "@/pages/ClinicalWorkbench";
import IntakeWorkbench from "@/pages/IntakeWorkbench";
import SafetyWorkbench from "@/pages/SafetyWorkbench";
import SettingsWorkbench from "@/pages/SettingsWorkbench";

validateRoutes();

function WorkbenchRouter() {
  return (
    <AppLayout>
      <Switch>
        <Route path={ROUTES.OPS} component={OperationsCockpit} />
        <Route path={ROUTES.CLINICAL} component={ClinicalWorkbench} />
        <Route path={ROUTES.INTAKE} component={IntakeWorkbench} />
        <Route path={ROUTES.SAFETY} component={SafetyWorkbench} />
        <Route path={ROUTES.LEARNING} component={EngineMetricsDashboard} />
        <Route path={ROUTES.SYSTEM} component={DependencyHealthMap} />
        <Route path={ROUTES.SETTINGS} component={SettingsWorkbench} />
        <Route path={ROUTES.WORKERS} component={WorkerMonitor} />
        <Route path={ROUTES.CLINIC} component={ClinicHealthDashboard} />
        <Route>
          {() => (
            <div className="p-6" data-testid="not-found">
              <h1 className="text-2xl font-semibold mb-2">Not found</h1>
              <p className="text-gray-500">
                This page does not exist in the current workbench layout.{" "}
                <a href={ROUTES.OPS} className="text-blue-600 underline">
                  Go to Operations
                </a>
              </p>
            </div>
          )}
        </Route>
      </Switch>
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/login" component={Login} />
      <Route path="/start" component={StartVisit} />
      <Route path="/intake/:token" component={PatientIntake} />
      <Route path="/simple/:token" component={SimpleIntake} />
      <Route path="/intake/:token/status" component={IntakeStatus} />
      <Route path="/intake/:token/summary" component={IntakeSummary} />
      <Route path="/provider/case" component={ProviderCaseView} />
      <Route path="/provider/case/:caseId" component={ProviderCaseView} />
      <Route path="/chat-intake" component={PatientIntakeChat} />
      <Route component={WorkbenchRouter} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
