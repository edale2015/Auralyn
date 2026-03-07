import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./context/AuthContext";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import PatientIntake from "@/pages/PatientIntake";
import SimpleIntake from "@/pages/SimpleIntake";
import IntakeStatus from "@/pages/IntakeStatus";
import IntakeSummary from "@/pages/IntakeSummary";
import StartVisit from "@/pages/StartVisit";
import ProviderCaseView from "@/pages/ProviderCaseView";
import TraceViewer from "@/pages/TraceViewer";
import ReviewQueue from "@/pages/ReviewQueue";
import CaseReview from "@/pages/CaseReview";
import PatientIntakeChat from "@/pages/PatientIntakeChat";
import Discrepancies from "@/pages/Discrepancies";
import RuntimeAnalytics from "@/pages/RuntimeAnalytics";
import ShadowModeOps from "@/pages/ShadowModeOps";
import CoercionAudit from "@/pages/CoercionAudit";
import ReviewQueueV2 from "@/pages/ReviewQueueV2";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/start" component={StartVisit} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/intake/:token" component={PatientIntake} />
      <Route path="/simple/:token" component={SimpleIntake} />
      <Route path="/intake/:token/status" component={IntakeStatus} />
      <Route path="/intake/:token/summary" component={IntakeSummary} />
      <Route path="/provider/case" component={ProviderCaseView} />
      <Route path="/provider/case/:caseId" component={ProviderCaseView} />
      <Route path="/review" component={ReviewQueue} />
      <Route path="/review/:caseId" component={CaseReview} />
      <Route path="/chat-intake" component={PatientIntakeChat} />
      <Route path="/discrepancies" component={Discrepancies} />
      <Route path="/runtime-analytics" component={RuntimeAnalytics} />
      <Route path="/shadow-mode-ops" component={ShadowModeOps} />
      <Route path="/coercion-audit" component={CoercionAudit} />
      <Route path="/review-queue-v2" component={ReviewQueueV2} />
      <Route path="/debug/traces" component={TraceViewer} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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

export default App;
