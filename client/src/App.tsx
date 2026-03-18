import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./context/AuthContext";
import AdminLayout from "@/components/AdminLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import AdminDashboard from "@/pages/AdminDashboard";
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
import GoldReviewWorkbench from "@/pages/GoldReviewWorkbench";
import RuleSuggestions from "@/pages/RuleSuggestions";
import SkillLayerReviewPage from "@/pages/SkillLayerReviewPage";
import SkillLayerAdminPage from "@/pages/SkillLayerAdminPage";
import TelemedicineConsole from "@/pages/TelemedicineConsole";
import TelemedicineDoctorDashboard from "@/pages/TelemedicineDoctorDashboard";
import RapidTelemedicineConsole from "@/pages/RapidTelemedicineConsole";
import TelemedicineSplitPaneConsole from "@/pages/TelemedicineSplitPaneConsole";
import AcceptanceSlaDashboardPage from "@/pages/AcceptanceSlaDashboardPage";
import ProductionReadinessPage from "@/pages/ProductionReadinessPage";
import RecommendationAnalyticsDashboardPage from "@/pages/RecommendationAnalyticsDashboardPage";
import EhrDeadLetterReviewPage from "@/pages/EhrDeadLetterReviewPage";
import ReminderTimelineInspectorPage from "@/pages/ReminderTimelineInspectorPage";
import MultilingualTemplateAuthoringPage from "@/pages/MultilingualTemplateAuthoringPage";
import OperationsCockpitPage from "@/pages/OperationsCockpitPage";
import SelfImproveDashboard from "@/pages/SelfImproveDashboard";
import PhysicianDashboard from "@/pages/PhysicianDashboard";
import ExecutiveDashboard from "@/pages/ExecutiveDashboard";
import HybridReasoningConsole from "@/pages/HybridReasoningConsole";
import UCSMConsole from "@/pages/UCSMConsole";
import ClinicalOpsConsole from "@/pages/ClinicalOpsConsole";
import SiteManagementPage from "@/pages/SiteManagementPage";
import SL3OutcomePage from "@/pages/SL3OutcomePage";
import SL4ProviderAnalyticsPage from "@/pages/SL4ProviderAnalyticsPage";
import SL5PopulationHealthPage from "@/pages/SL5PopulationHealthPage";
import SL6ClinicalCodingPage from "@/pages/SL6ClinicalCodingPage";
import SL7CommHubPage from "@/pages/SL7CommHubPage";
import SL8TenantOrchestrationPage from "@/pages/SL8TenantOrchestrationPage";
import AutonomousIntakePage from "@/pages/AutonomousIntakePage";
import RLPolicyPage from "@/pages/RLPolicyPage";
import CarePathwayPage from "@/pages/CarePathwayPage";
import ClinicalCopilotPage from "@/pages/ClinicalCopilotPage";
import PredictiveRiskPage from "@/pages/PredictiveRiskPage";
import MessagingStatusPage from "@/pages/MessagingStatusPage";
import PhysicianAnalyticsPage from "@/pages/PhysicianAnalyticsPage";
import MismatchDashboard from "@/pages/MismatchDashboard";
import PerformanceStats from "@/pages/PerformanceStats";
import EngineRegistryPage from "@/pages/EngineRegistryPage";
import EngineAtlasDashboard from "@/pages/EngineAtlasDashboard";
import GoldenCasesPage from "@/pages/GoldenCasesPage";
import MetaClinicalConsolePage from "@/pages/MetaClinicalConsolePage";
import ResearchIntelligencePage from "@/pages/ResearchIntelligencePage";
import ClinicalVisualizationPage from "@/pages/ClinicalVisualizationPage";
import ConversationOptimizationPage from "@/pages/ConversationOptimizationPage";
import ClinicalCockpitPage from "@/pages/ClinicalCockpitPage";
import ClinicalSimulationLab from "@/pages/ClinicalSimulationLab";
import ClinicalControlTower from "@/pages/ClinicalControlTower";
import ClinicalKnowledgeGraphPage from "@/pages/ClinicalKnowledgeGraphPage";
import ClinicalSchemaValidatorPage from "@/pages/ClinicalSchemaValidatorPage";
import ClinicalGovernancePage from "@/pages/ClinicalGovernancePage";
import ClinicalVersionControlPage from "@/pages/ClinicalVersionControlPage";
import ClinicalIntelligenceControlCenter from "@/pages/ClinicalIntelligenceControlCenter";
import ClinicalAnalyticsEngines from "@/pages/ClinicalAnalyticsEngines";
import AdvancedClinicalEngines from "@/pages/AdvancedClinicalEngines";
import ClinicalBrainMonitor from "@/pages/ClinicalBrainMonitor";
import SelfImprovingBrainDashboard from "@/pages/SelfImprovingBrainDashboard";
import AuralynDashboard from "@/pages/AuralynDashboard";
import EHRIntegrationDashboard from "@/pages/EHRIntegrationDashboard";
import ClinicalScaleDashboard from "@/pages/ClinicalScaleDashboard";
import OperationsDashboard from "@/pages/OperationsDashboard";
import SmartIntakeDashboard from "@/pages/SmartIntakeDashboard";
import IntelligenceDashboard from "@/pages/IntelligenceDashboard";
import AdaptiveControlDashboard from "@/pages/AdaptiveControlDashboard";
import PackBuilderAdminPage from "@/pages/PackBuilderAdminPage";
import PackSimulatorPage from "@/pages/PackSimulatorPage";
import PackQuestionsAdminPage from "@/pages/PackQuestionsAdminPage";
import PackAuditLogPage from "@/pages/PackAuditLogPage";
import CoverageDashboard from "@/pages/CoverageDashboard";
import NotFound from "@/pages/not-found";

function AdminPage({ component: Component }: { component: React.ComponentType }) {
  return (
    <AdminLayout>
      <Component />
    </AdminLayout>
  );
}

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
      <Route path="/admin">{() => <AdminPage component={AdminDashboard} />}</Route>
      <Route path="/complaint-control-center">{() => <AdminPage component={ComplaintControlCenter} />}</Route>
      <Route path="/review-queue-v2">{() => <AdminPage component={ReviewQueueV2} />}</Route>
      <Route path="/complaint-qa">{() => <AdminPage component={ComplaintQADashboard} />}</Route>
      <Route path="/clinical-validation">{() => <AdminPage component={ClinicalValidation} />}</Route>
      <Route path="/clinical-workflow-health">{() => <AdminPage component={ClinicalWorkflowHealth} />}</Route>
      <Route path="/next-best-question">{() => <AdminPage component={NextBestQuestionInspector} />}</Route>
      <Route path="/override-patterns">{() => <AdminPage component={OverridePatterns} />}</Route>
      <Route path="/question-gaps">{() => <AdminPage component={QuestionGaps} />}</Route>
      <Route path="/decision-graphs">{() => <AdminPage component={DecisionGraphExplorer} />}</Route>
      <Route path="/decision-graph-heatmaps">{() => <AdminPage component={DecisionGraphHeatmaps} />}</Route>
      <Route path="/formulary">{() => <AdminPage component={FormularyAdmin} />}</Route>
      <Route path="/outcome-capture">{() => <AdminPage component={OutcomeCapture} />}</Route>
      <Route path="/outcome-monitoring">{() => <AdminPage component={OutcomeMonitoring} />}</Route>
      <Route path="/discrepancies">{() => <AdminPage component={Discrepancies} />}</Route>
      <Route path="/ecw-workbench">{() => <AdminPage component={EcwExportWorkbench} />}</Route>
      <Route path="/patient-consent">{() => <AdminPage component={PatientConsentAdmin} />}</Route>
      <Route path="/coercion-audit">{() => <AdminPage component={CoercionAudit} />}</Route>
      <Route path="/ai-assistant">{() => <AdminPage component={AIAssistant} />}</Route>
      <Route path="/agent-ops">{() => <AdminPage component={AgentOps} />}</Route>
      <Route path="/ms-agent-ops">{() => <AdminPage component={MicrosoftAgentOps} />}</Route>
      <Route path="/ops-daily-digest">{() => <AdminPage component={OpsDailyDigest} />}</Route>
      <Route path="/runtime-analytics">{() => <AdminPage component={RuntimeAnalytics} />}</Route>
      <Route path="/notifications">{() => <AdminPage component={Notifications} />}</Route>
      <Route path="/message-ops">{() => <AdminPage component={MessageOps} />}</Route>
      <Route path="/shadow-mode-ops">{() => <AdminPage component={ShadowModeOps} />}</Route>
      <Route path="/organizations">{() => <AdminPage component={Organizations} />}</Route>
      <Route path="/audit-reports">{() => <AdminPage component={AuditReports} />}</Route>
      <Route path="/release-governance">{() => <AdminPage component={ReleaseGovernance} />}</Route>
      <Route path="/performance-stats">{() => <AdminPage component={PerformanceStats} />}</Route>
      <Route path="/synthetic-testing">{() => <AdminPage component={SyntheticTesting} />}</Route>
      <Route path="/rule-suggestions">{() => <AdminPage component={RuleSuggestions} />}</Route>
      <Route path="/mismatch-dashboard/:runId">{() => <AdminPage component={MismatchDashboard} />}</Route>
      <Route path="/gold-reviews">{() => <AdminPage component={GoldReviewWorkbench} />}</Route>
      <Route path="/skill-layer-review">{() => <AdminPage component={SkillLayerReviewPage} />}</Route>
      <Route path="/skill-layer-admin">{() => <AdminPage component={SkillLayerAdminPage} />}</Route>
      <Route path="/telemedicine">{() => <AdminPage component={TelemedicineConsole} />}</Route>
      <Route path="/telemed-doctor-dashboard">{() => <AdminPage component={TelemedicineDoctorDashboard} />}</Route>
      <Route path="/rapid-telemed">{() => <AdminPage component={RapidTelemedicineConsole} />}</Route>
      <Route path="/telemed-split">{() => <AdminPage component={TelemedicineSplitPaneConsole} />}</Route>
      <Route path="/acceptance-sla">{() => <AdminPage component={AcceptanceSlaDashboardPage} />}</Route>
      <Route path="/production-readiness">{() => <AdminPage component={ProductionReadinessPage} />}</Route>
      <Route path="/recommendation-analytics">{() => <AdminPage component={RecommendationAnalyticsDashboardPage} />}</Route>
      <Route path="/ehr-dead-letter">{() => <AdminPage component={EhrDeadLetterReviewPage} />}</Route>
      <Route path="/reminder-timeline">{() => <AdminPage component={ReminderTimelineInspectorPage} />}</Route>
      <Route path="/multilingual-templates">{() => <AdminPage component={MultilingualTemplateAuthoringPage} />}</Route>
      <Route path="/operations-cockpit">{() => <AdminPage component={OperationsCockpitPage} />}</Route>
      <Route path="/self-improve">{() => <AdminPage component={SelfImproveDashboard} />}</Route>
      <Route path="/hybrid-reasoning">{() => <AdminPage component={HybridReasoningConsole} />}</Route>
      <Route path="/ucsm">{() => <AdminPage component={UCSMConsole} />}</Route>
      <Route path="/clinical-ops">{() => <AdminPage component={ClinicalOpsConsole} />}</Route>
      <Route path="/site-management">{() => <AdminPage component={SiteManagementPage} />}</Route>
      <Route path="/sl3-outcomes">{() => <AdminPage component={SL3OutcomePage} />}</Route>
      <Route path="/sl4-provider-analytics">{() => <AdminPage component={SL4ProviderAnalyticsPage} />}</Route>
      <Route path="/sl5-population-health">{() => <AdminPage component={SL5PopulationHealthPage} />}</Route>
      <Route path="/sl6-clinical-coding">{() => <AdminPage component={SL6ClinicalCodingPage} />}</Route>
      <Route path="/sl7-comm-hub">{() => <AdminPage component={SL7CommHubPage} />}</Route>
      <Route path="/sl8-tenant-orchestration">{() => <AdminPage component={SL8TenantOrchestrationPage} />}</Route>
      <Route path="/autonomous-intake">{() => <AdminPage component={AutonomousIntakePage} />}</Route>
      <Route path="/rl-policy">{() => <AdminPage component={RLPolicyPage} />}</Route>
      <Route path="/care-pathways">{() => <AdminPage component={CarePathwayPage} />}</Route>
      <Route path="/clinical-copilot">{() => <AdminPage component={ClinicalCopilotPage} />}</Route>
      <Route path="/predictive-risk">{() => <AdminPage component={PredictiveRiskPage} />}</Route>
      <Route path="/debug/traces">{() => <AdminPage component={TraceViewer} />}</Route>
      <Route path="/messaging-status">{() => <AdminPage component={MessagingStatusPage} />}</Route>
      <Route path="/physician-analytics">{() => <AdminPage component={PhysicianAnalyticsPage} />}</Route>
      <Route path="/engine-registry">{() => <AdminPage component={EngineRegistryPage} />}</Route>
      <Route path="/engine-atlas">{() => <AdminPage component={EngineAtlasDashboard} />}</Route>
      <Route path="/golden-cases">{() => <AdminPage component={GoldenCasesPage} />}</Route>
      <Route path="/meta-clinical">{() => <AdminPage component={MetaClinicalConsolePage} />}</Route>
      <Route path="/research-intelligence">{() => <AdminPage component={ResearchIntelligencePage} />}</Route>
      <Route path="/clinical-visualization">{() => <AdminPage component={ClinicalVisualizationPage} />}</Route>
      <Route path="/conversation-optimization">{() => <AdminPage component={ConversationOptimizationPage} />}</Route>
      <Route path="/clinical-cockpit">{() => <AdminPage component={ClinicalCockpitPage} />}</Route>
      <Route path="/simulation-lab">{() => <AdminPage component={ClinicalSimulationLab} />}</Route>
      <Route path="/control-tower">{() => <AdminPage component={ClinicalControlTower} />}</Route>
      <Route path="/knowledge-graph">{() => <AdminPage component={ClinicalKnowledgeGraphPage} />}</Route>
      <Route path="/schema-validator">{() => <AdminPage component={ClinicalSchemaValidatorPage} />}</Route>
      <Route path="/clinical-governance">{() => <AdminPage component={ClinicalGovernancePage} />}</Route>
      <Route path="/clinical-version-control">{() => <AdminPage component={ClinicalVersionControlPage} />}</Route>
      <Route path="/intelligence-control-center">{() => <AdminPage component={ClinicalIntelligenceControlCenter} />}</Route>
      <Route path="/clinical-analytics-engines">{() => <AdminPage component={ClinicalAnalyticsEngines} />}</Route>
      <Route path="/advanced-clinical-engines">{() => <AdminPage component={AdvancedClinicalEngines} />}</Route>
      <Route path="/clinical-brain-monitor">{() => <AdminPage component={ClinicalBrainMonitor} />}</Route>
      <Route path="/self-improving-brain">{() => <AdminPage component={SelfImprovingBrainDashboard} />}</Route>
      <Route path="/auralyn">{() => <AdminPage component={AuralynDashboard} />}</Route>
      <Route path="/ehr-integration">{() => <AdminPage component={EHRIntegrationDashboard} />}</Route>
      <Route path="/clinical-scale">{() => <AdminPage component={ClinicalScaleDashboard} />}</Route>
      <Route path="/operations-dashboard">{() => <AdminPage component={OperationsDashboard} />}</Route>
      <Route path="/smart-intake">{() => <AdminPage component={SmartIntakeDashboard} />}</Route>
      <Route path="/intelligence-layer">{() => <AdminPage component={IntelligenceDashboard} />}</Route>
      <Route path="/adaptive-control">{() => <AdminPage component={AdaptiveControlDashboard} />}</Route>
      <Route path="/pack-builder">{() => <AdminPage component={PackBuilderAdminPage} />}</Route>
      <Route path="/pack-simulator">{() => <AdminPage component={PackSimulatorPage} />}</Route>
      <Route path="/pack-questions">{() => <AdminPage component={PackQuestionsAdminPage} />}</Route>
      <Route path="/pack-audit-log">{() => <AdminPage component={PackAuditLogPage} />}</Route>
      <Route path="/coverage-dashboard">{() => <AdminPage component={CoverageDashboard} />}</Route>
      <Route path="/physician-dashboard">{() => <AdminPage component={PhysicianDashboard} />}</Route>
      <Route path="/executive-dashboard">{() => <AdminPage component={ExecutiveDashboard} />}</Route>
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
