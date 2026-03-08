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
import OverridePatterns from "@/pages/OverridePatterns";
import QuestionGaps from "@/pages/QuestionGaps";
import OpsDailyDigest from "@/pages/OpsDailyDigest";
import ClinicalWorkflowHealth from "@/pages/ClinicalWorkflowHealth";
import NextBestQuestionInspector from "@/pages/NextBestQuestionInspector";
import OutcomeCapture from "@/pages/OutcomeCapture";
import ComplaintQADashboard from "@/pages/ComplaintQADashboard";
import Organizations from "@/pages/Organizations";
import Notifications from "@/pages/Notifications";
import EcwExportWorkbench from "@/pages/EcwExportWorkbench";
import AuditReports from "@/pages/AuditReports";
import MessageOps from "@/pages/MessageOps";
import FormularyAdmin from "@/pages/FormularyAdmin";
import OutcomeMonitoring from "@/pages/OutcomeMonitoring";
import PatientConsentAdmin from "@/pages/PatientConsentAdmin";
import ClinicalValidation from "@/pages/ClinicalValidation";
import ReleaseGovernance from "@/pages/ReleaseGovernance";
import AgentOps from "@/pages/AgentOps";
import MicrosoftAgentOps from "@/pages/MicrosoftAgentOps";
import AIAssistant from "@/pages/AIAssistant";
import DecisionGraphExplorer from "@/pages/DecisionGraphExplorer";
import DecisionGraphHeatmaps from "@/pages/DecisionGraphHeatmaps";
import ComplaintControlCenter from "@/pages/ComplaintControlCenter";
import SyntheticTesting from "@/pages/SyntheticTesting";
import PerformanceStats from "@/pages/PerformanceStats";
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
      <Route path="/override-patterns" component={OverridePatterns} />
      <Route path="/question-gaps" component={QuestionGaps} />
      <Route path="/ops-daily-digest" component={OpsDailyDigest} />
      <Route path="/clinical-workflow-health" component={ClinicalWorkflowHealth} />
      <Route path="/next-best-question" component={NextBestQuestionInspector} />
      <Route path="/outcome-capture" component={OutcomeCapture} />
      <Route path="/complaint-qa" component={ComplaintQADashboard} />
      <Route path="/organizations" component={Organizations} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/ecw-workbench" component={EcwExportWorkbench} />
      <Route path="/audit-reports" component={AuditReports} />
      <Route path="/message-ops" component={MessageOps} />
      <Route path="/formulary" component={FormularyAdmin} />
      <Route path="/outcome-monitoring" component={OutcomeMonitoring} />
      <Route path="/patient-consent" component={PatientConsentAdmin} />
      <Route path="/clinical-validation" component={ClinicalValidation} />
      <Route path="/release-governance" component={ReleaseGovernance} />
      <Route path="/agent-ops" component={AgentOps} />
      <Route path="/ms-agent-ops" component={MicrosoftAgentOps} />
      <Route path="/ai-assistant" component={AIAssistant} />
      <Route path="/decision-graphs" component={DecisionGraphExplorer} />
      <Route path="/decision-graph-heatmaps" component={DecisionGraphHeatmaps} />
      <Route path="/complaint-control-center" component={ComplaintControlCenter} />
      <Route path="/synthetic-testing" component={SyntheticTesting} />
      <Route path="/performance-stats" component={PerformanceStats} />
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
