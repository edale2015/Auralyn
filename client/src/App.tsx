import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./context/AuthContext";
import { AuralynCommandInterface } from "@/components/AuralynCommandInterface";

import AppLayout from "./layouts/AppLayout";
import { ROUTES } from "./routes/routeRegistry";
import { validateRoutes } from "./utils/routeValidator";
import RoleGuard from "@/components/RoleGuard";

import Login from "@/pages/Login";
import PatientIntake from "@/pages/PatientIntake";
import SimpleIntake from "@/pages/SimpleIntake";
import IntakeStatus from "@/pages/IntakeStatus";
import IntakeSummary from "@/pages/IntakeSummary";
import StartVisit from "@/pages/StartVisit";
import ProviderCaseView from "@/pages/ProviderCaseView";
import PatientIntakeChat from "@/pages/PatientIntakeChat";
import PatientAIChat from "@/pages/PatientAIChat";
import HomePortal from "@/pages/HomePortal";
import PortalRouter from "@/pages/PortalRouter";

import OperationsCockpit from "@/pages/OperationsCockpit";
import DependencyHealthMap from "@/pages/DependencyHealthMap";
import EngineMetricsDashboard from "@/pages/EngineMetricsDashboard";
import WorkerMonitor from "@/pages/WorkerMonitor";
import ClinicHealthDashboard from "@/pages/ClinicHealthDashboard";
import ClinicalWorkbench from "@/pages/ClinicalWorkbench";
import IntakeWorkbench from "@/pages/IntakeWorkbench";
import SafetyWorkbench from "@/pages/SafetyWorkbench";
import SettingsWorkbench from "@/pages/SettingsWorkbench";
import AutomationDashboard from "@/pages/AutomationDashboard";
import AutomationStudio from "@/pages/AutomationStudio";
import LiveSimulationPage from "@/pages/LiveSimulationPage";
import LiveCommandCenter from "@/pages/LiveCommandCenter";
import PilotDashboardPage from "@/pages/PilotDashboardPage";
import MasterControlTower from "@/pages/MasterControlTower";
import AutomationRunDetail from "@/pages/AutomationRunDetail";
import AutomationRecorder from "@/pages/AutomationRecorder";
import AutomationReplay from "@/pages/AutomationReplay";
import TemplateHealthDashboard from "@/pages/TemplateHealthDashboard";
import TemplateStudioPage from "@/pages/TemplateStudioPage";
import RoboticsControlPage from "@/pages/RoboticsControlPage";
import ReplayInspectorPage from "@/pages/ReplayInspectorPage";
import AutonomousBrainDashboard from "@/pages/AutonomousBrainDashboard";
import ClinicalBrainDashboard from "@/pages/ClinicalBrainDashboard";
import HierarchicalCouncilDashboard from "@/pages/HierarchicalCouncilDashboard";
import BrainCommandCenter from "@/pages/BrainCommandCenter";
import MemoryExplorer from "@/pages/MemoryExplorer";
import RobotControlAdvanced from "@/pages/RobotControlAdvanced";
import RobotCamera from "@/pages/RobotCamera";
import PhysicianMobile from "@/pages/PhysicianMobile";
import OrchestrationDashboard from "@/pages/OrchestrationDashboard";
import ControlTowerPage from "@/pages/ControlTowerPage";
import SystemMonitorPage from "@/pages/SystemMonitorPage";
import FDADashboardPage from "@/pages/FDADashboardPage";
import PriorAuthPage from "@/pages/PriorAuthPage";
import EligibilityPage from "@/pages/EligibilityPage";
import PopulationHealthPage from "@/pages/PopulationHealthPage";
import ExperimentsPage from "@/pages/ExperimentsPage";
import VoiceTriagePage from "@/pages/VoiceTriagePage";
import DecisionTreePage from "@/pages/DecisionTreePage";
import FDAValidationPage from "@/pages/FDAValidationPage";
import LiveClinicPage from "@/pages/LiveClinicPage";
import ProductionReadinessPage from "@/pages/ProductionReadinessPage";
import BillingIntelligencePage from "@/pages/BillingIntelligencePage";
import RevenueWarRoomPage from "@/pages/RevenueWarRoomPage";
import SystemWarRoomPage from "@/pages/SystemWarRoomPage";
import OrchestratorPanel from "@/pages/OrchestratorPanel";
import ArchitecturalCompliancePage from "@/pages/ArchitecturalCompliancePage";
import MoatIntelligencePage from "@/pages/MoatIntelligencePage";
import ExecutiveCommandPage from "@/pages/ExecutiveCommandPage";
import ComponentHubPage from "@/pages/ComponentHubPage";
import ClinicalTestBenchPage from "@/pages/ClinicalTestBenchPage";
import AutonomousLearningConsolePage from "@/pages/AutonomousLearningConsolePage";
import KnowledgeBasePage from "@/pages/KnowledgeBasePage";
import KnowledgeOpsDashboardPage from "@/pages/KnowledgeOpsDashboardPage";
import KnowledgeHubPage from "@/pages/KnowledgeHubPage";
import GoldenCasesPage from "@/pages/GoldenCasesPage";
import SkillLayerAdminPage from "@/pages/SkillLayerAdminPage";
import SkillLayerReviewPage from "@/pages/SkillLayerReviewPage";
import ClinicalKnowledgeGraphPage from "@/pages/ClinicalKnowledgeGraphPage";
import ClinicalControlTowerPage from "@/pages/ClinicalControlTowerPage";
import SystemControlTowerPage from "@/pages/SystemControlTowerPage";
import MultiPatientCommandPage from "@/pages/MultiPatientCommandPage";
import ClinicalQAPage from "@/pages/ClinicalQAPage";
import ClinicalImprovementLabPage from "@/pages/ClinicalImprovementLabPage";
import ClinicalSimulationLabPage from "@/pages/ClinicalSimulationLabPage";
import ComplaintLabPage from "@/pages/ComplaintLabPage";
import ComplaintTestLabPage from "@/pages/ComplaintTestLabPage";
import ClinicalDecisionPipelinePage from "@/pages/ClinicalDecisionPipelinePage";
import CarePathwayOptimizerPage from "@/pages/CarePathwayOptimizerPage";
import GovernanceCommandCenterPage from "@/pages/GovernanceCommandCenterPage";
import ResearchRadarDashboard      from "@/pages/ResearchRadarDashboard";
import LongevityIntelligencePage   from "@/pages/LongevityIntelligencePage";
import ClinicalSkillsDashboard    from "@/pages/ClinicalSkillsDashboard";
import InfraStatusDashboard       from "@/pages/InfraStatusDashboard";
import PhysicianCMEQuizTool       from "@/pages/PhysicianCMEQuizTool";
import PhysicianPathwayReview     from "@/pages/PhysicianPathwayReview";
import MasterRuleMapPage          from "@/pages/MasterRuleMapPage";
import ClinicalKBEditorPage       from "@/pages/ClinicalKBEditorPage";
import EncounterSimulatorPage     from "@/pages/EncounterSimulatorPage";
import ComplaintsReviewPage       from "@/pages/ComplaintsReviewPage";
import DifferentialDispositionPage from "@/pages/DifferentialDispositionPage";
import IntentAnalyticsDashboard   from "@/pages/IntentAnalyticsDashboard";
import SkillMapPage from "@/pages/SkillMapPage";
import SkillIntelligenceLabPage from "@/pages/SkillIntelligenceLabPage";
import SkillEvolutionLabPage from "@/pages/SkillEvolutionLabPage";
import MissionControlPage         from "@/pages/MissionControlPage";
import MissionControlPhase2       from "@/pages/MissionControlPhase2";
import SystemValidationDashboard   from "@/pages/SystemValidationDashboard";
import ClinicalOperationsCenter   from "@/pages/ClinicalOperationsCenter";
import ClinicalBrainPage          from "@/pages/ClinicalBrainPage";
import CognitiveBrainPage         from "@/pages/CognitiveBrainPage";
import AgentSystemPage            from "@/pages/AgentSystemPage";
import HospitalDashboard          from "@/pages/HospitalDashboard";
import AuralynControlSystem       from "@/pages/AuralynControlSystem";
import LivePatientMonitor         from "@/pages/LivePatientMonitor";
import HospitalCommandCenter      from "@/pages/HospitalCommandCenter";
import CommandCenterV2Page from "@/pages/CommandCenterV2Page";
import CommandCenterV3Page from "@/pages/CommandCenterV3Page";
import CommandCenterV4Page from "@/pages/CommandCenterV4Page";
import NYCPilotPage        from "@/pages/NYCPilotPage";
import HospitalWallPage    from "@/pages/HospitalWallPage";
import ResearchInboxPage       from "@/pages/ResearchInboxPage";
import AgentHandoffPage        from "@/pages/AgentHandoffPage";
import CrossModelReviewInbox   from "@/pages/CrossModelReviewInbox";
import SlicePipelineAdmin      from "@/pages/SlicePipelineAdmin";
import FDAAuditPage        from "@/pages/FDAAuditPage";
import AdminClaudeExportPage from "@/pages/AdminClaudeExportPage";
import IntegrationHealthPage from "@/pages/IntegrationHealthPage";
import EngineMaintenancePage from "@/pages/EngineMaintenancePage";
import AgentLabPage from "@/pages/AgentLabPage";
import AgentBrainPage       from "@/pages/AgentBrainPage";
import HardeningReviewPage  from "@/pages/HardeningReviewPage";
import PhysicianCommandStrip from "@/pages/PhysicianCommandStrip";
import PatientGridPage from "@/pages/PatientGridPage";
import SystemOpsGridPage from "@/pages/SystemOpsGridPage";
import KBExplorerPage from "@/pages/KBExplorerPage";
import ConversationOptimizationPage from "@/pages/ConversationOptimizationPage";
import GoldReviewWorkbench from "@/pages/GoldReviewWorkbench";
import CompactIntakePage from "@/pages/CompactIntakePage";
import MessagingFlowPage from "@/pages/MessagingFlowPage";
import AIInteractionMonitorPage from "@/pages/AIInteractionMonitorPage";
import WorkflowBuilder from "@/pages/WorkflowBuilder";
import WorkflowCanvas from "@/pages/WorkflowCanvas";
import WorkflowCanvasFull from "@/pages/WorkflowCanvasFull";
import SmartLaunch from "@/pages/SmartLaunch";
import SmartCallback from "@/pages/SmartCallback";
import AlertRules from "@/pages/AlertRules";
import EpicTest from "@/pages/EpicTest";
import MultiTenantDashboard from "@/pages/MultiTenantDashboard";
import PhysicianCopilot from "@/pages/PhysicianCopilot";
import AdminPanel from "@/pages/AdminPanel";
import UIAutomationPanel from "@/pages/UIAutomationPanel";
import ControlTower from "@/pages/ControlTower";
import MasterControl from "@/pages/MasterControl";
import ICUControlTower from "@/pages/ICUControlTower";
import ValidationDashboard from "@/pages/ValidationDashboard";
import NetworkControlTower from "@/pages/NetworkControlTower";
import KBReviewDashboard from "@/pages/KBReviewDashboard";
import DeepAgentDashboard from "@/pages/DeepAgentDashboard";
import CommunicationDashboard from "@/pages/CommunicationDashboard";
import RoutingTelemetryDashboard from "@/pages/RoutingTelemetryDashboard";
import ScopeCommandCenter from "@/pages/ScopeCommandCenter";
import CommandWall     from "@/pages/CommandWall";
import RegionalCommand from "@/pages/RegionalCommand";
import GlobalCommand   from "@/pages/GlobalCommand";
import AuditReplay     from "@/pages/AuditReplay";
import ClinicalTrials  from "@/pages/ClinicalTrials";
import ReviewQueueV2    from "@/pages/ReviewQueueV2";
import CaseReview        from "@/pages/CaseReview";
import PhysicianDashboard from "@/pages/PhysicianDashboard";
import ProviderFeedbackDashboard from "@/pages/ProviderFeedbackDashboard";
import FollowUpMonitoringDashboard from "@/pages/FollowUpMonitoringDashboard";
import TelemedicineDoctorDashboard from "@/pages/TelemedicineDoctorDashboard";
import ClinicalValidation from "@/pages/ClinicalValidation";
import OutcomeMonitoring  from "@/pages/OutcomeMonitoring";
import ClinicalICUMonitor from "@/pages/ClinicalICUMonitor";
import PatientLivingEncounter from "@/pages/PatientLivingEncounter";

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
        <Route path="/review" component={ReviewQueueV2} />
        <Route path="/review/:caseId" component={CaseReview} />
        <Route path="/cases" component={ProviderCaseView} />
        <Route path="/physician-dashboard" component={PhysicianDashboard} />
        <Route path="/physician-feedback" component={ProviderFeedbackDashboard} />
        <Route path="/follow-up-monitoring" component={FollowUpMonitoringDashboard} />
        <Route path="/telemed-doctor-dashboard" component={TelemedicineDoctorDashboard} />
        <Route path="/clinical-validation" component={ClinicalValidation} />
        <Route path="/outcome-monitoring" component={OutcomeMonitoring} />
        <Route path="/operations-cockpit" component={OperationsCockpit} />
        <Route path={ROUTES.AUTOMATION} component={AutomationDashboard} />
        <Route path="/automation/runs/:runId" component={AutomationRunDetail} />
        <Route path="/automation/studio" component={AutomationStudio} />
        <Route path="/live-simulation" component={LiveSimulationPage} />
        <Route path="/command-center" component={LiveCommandCenter} />
        <Route path="/pilot-dashboard" component={PilotDashboardPage} />
        <Route path="/master-control" component={MasterControlTower} />
        <Route path="/automation/recorder" component={AutomationRecorder} />
        <Route path="/automation/replay/:runId" component={AutomationReplay} />
        <Route path="/automation/health" component={TemplateHealthDashboard} />
        <Route path={ROUTES.TEMPLATE_STUDIO} component={TemplateStudioPage} />
        <Route path={ROUTES.ROBOTICS} component={RoboticsControlPage} />
        <Route path={ROUTES.REPLAY_INSPECTOR} component={ReplayInspectorPage} />
        <Route path={ROUTES.AUTONOMOUS_BRAIN} component={AutonomousBrainDashboard} />
        <Route path={ROUTES.CLINICAL_BRAIN_DASHBOARD} component={ClinicalBrainDashboard} />
        <Route path={ROUTES.HIERARCHICAL_COUNCIL} component={HierarchicalCouncilDashboard} />
        <Route path={ROUTES.BRAIN_COMMAND_CENTER} component={BrainCommandCenter} />
        <Route path={ROUTES.MEMORY_EXPLORER} component={MemoryExplorer} />
        <Route path={ROUTES.ROBOT_ADVANCED} component={RobotControlAdvanced} />
        <Route path={ROUTES.ROBOT_CAMERA} component={RobotCamera} />
        <Route path={ROUTES.PHYSICIAN_MOBILE} component={PhysicianMobile} />
        <Route path={ROUTES.ORCHESTRATION} component={OrchestrationDashboard} />
        <Route path={ROUTES.CONTROL_TOWER} component={ControlTowerPage} />
        <Route path={ROUTES.COMPONENT_HUB} component={ComponentHubPage} />
        <Route path={ROUTES.TEST_BENCH} component={ClinicalTestBenchPage} />
        <Route path={ROUTES.AUTONOMOUS_LEARNING} component={AutonomousLearningConsolePage} />
        <Route path={ROUTES.KNOWLEDGE_BASE} component={KnowledgeBasePage} />
        <Route path={ROUTES.KNOWLEDGE_OPS} component={KnowledgeOpsDashboardPage} />
        <Route path={ROUTES.KNOWLEDGE_HUB} component={KnowledgeHubPage} />
        <Route path={ROUTES.GOLDEN_CASES} component={GoldenCasesPage} />
        <Route path={ROUTES.SKILL_LAYER_ADMIN}>{() => <RoleGuard allowedRoles={["admin"]}><SkillLayerAdminPage /></RoleGuard>}</Route>
        <Route path={ROUTES.SKILL_LAYER_REVIEW} component={SkillLayerReviewPage} />
        <Route path={ROUTES.KNOWLEDGE_GRAPH} component={ClinicalKnowledgeGraphPage} />
        <Route path={ROUTES.CLINICAL_CONTROL_TOWER} component={ClinicalControlTowerPage} />
        <Route path={ROUTES.SYSTEM_CONTROL_TOWER} component={SystemControlTowerPage} />
        <Route path="/multi-patient-command" component={MultiPatientCommandPage} />
        <Route path="/clinical-qa" component={ClinicalQAPage} />
        <Route path="/simulation-lab">{() => <RoleGuard allowedRoles={["admin", "physician"]}><ClinicalSimulationLabPage /></RoleGuard>}</Route>
        <Route path="/complaint-lab">{() => <RoleGuard allowedRoles={["admin", "physician"]}><ComplaintLabPage /></RoleGuard>}</Route>
        <Route path="/complaint-test-lab">{() => <RoleGuard allowedRoles={["admin", "physician"]}><ComplaintTestLabPage /></RoleGuard>}</Route>
        <Route path="/clinical-pipeline">{() => <RoleGuard allowedRoles={["admin", "physician", "clinician"]}><ClinicalDecisionPipelinePage /></RoleGuard>}</Route>
        <Route path="/clinical-improvement-lab">{() => <RoleGuard allowedRoles={["admin", "physician"]}><ClinicalImprovementLabPage /></RoleGuard>}</Route>
        <Route path="/care-pathway-optimizer" component={CarePathwayOptimizerPage} />
        <Route path="/governance-command-center">{() => <RoleGuard allowedRoles={["admin"]}><GovernanceCommandCenterPage /></RoleGuard>}</Route>
        <Route path="/research-radar">{() => <RoleGuard allowedRoles={["admin"]}><ResearchRadarDashboard /></RoleGuard>}</Route>
        <Route path="/longevity-intelligence">{() => <RoleGuard allowedRoles={["admin", "physician"]}><LongevityIntelligencePage /></RoleGuard>}</Route>
        <Route path="/clinical-skills">{() => <RoleGuard allowedRoles={["admin", "physician"]}><ClinicalSkillsDashboard /></RoleGuard>}</Route>
        <Route path="/infra-status">{() => <RoleGuard allowedRoles={["admin"]}><InfraStatusDashboard /></RoleGuard>}</Route>
        <Route path="/cme-quiz">{() => <RoleGuard allowedRoles={["admin", "physician"]}><PhysicianCMEQuizTool /></RoleGuard>}</Route>
        <Route path="/pathway-review">{() => <RoleGuard allowedRoles={["admin", "physician"]}><PhysicianPathwayReview /></RoleGuard>}</Route>
        <Route path="/rule-map">{() => <RoleGuard allowedRoles={["admin", "physician"]}><MasterRuleMapPage /></RoleGuard>}</Route>
        <Route path="/kb-editor">{() => <RoleGuard allowedRoles={["admin", "physician"]}><ClinicalKBEditorPage /></RoleGuard>}</Route>
        <Route path="/encounter">{() => <RoleGuard allowedRoles={["admin", "physician"]}><EncounterSimulatorPage /></RoleGuard>}</Route>
        <Route path="/complaints-review">{() => <RoleGuard allowedRoles={["admin", "physician"]}><ComplaintsReviewPage /></RoleGuard>}</Route>
        <Route path="/diff-disposition">{() => <RoleGuard allowedRoles={["admin", "physician"]}><DifferentialDispositionPage /></RoleGuard>}</Route>
        <Route path="/intent-analytics">{() => <RoleGuard allowedRoles={["admin"]}><IntentAnalyticsDashboard /></RoleGuard>}</Route>
        <Route path="/scope-command-center"  component={ScopeCommandCenter} />
        <Route path="/command-wall"          component={CommandWall} />
        <Route path="/regional-command"      component={RegionalCommand} />
        <Route path="/global-command"        component={GlobalCommand} />
        <Route path="/audit-replay"          component={AuditReplay} />
        <Route path="/clinical-trials"       component={ClinicalTrials} />
        <Route path="/skill-map" component={SkillMapPage} />
        <Route path="/skill-intelligence-lab" component={SkillIntelligenceLabPage} />
        <Route path="/skill-evolution-lab" component={SkillEvolutionLabPage} />
        <Route path={ROUTES.MISSION_CONTROL}        component={MissionControlPage} />
        <Route path={ROUTES.MISSION_CONTROL_PHASE2} component={MissionControlPhase2} />
        <Route path={ROUTES.SYSTEM_VALIDATION}      component={SystemValidationDashboard} />
        <Route path={ROUTES.CLINICAL_OPS_CENTER}    component={ClinicalOperationsCenter} />
        <Route path={ROUTES.CLINICAL_BRAIN}         component={ClinicalBrainPage} />
        <Route path={ROUTES.COGNITIVE_BRAIN}        component={CognitiveBrainPage} />
        <Route path={ROUTES.AGENT_SYSTEM}           component={AgentSystemPage} />
        <Route path={ROUTES.HOSPITAL}               component={HospitalDashboard} />
        <Route path={ROUTES.AURALYN}                component={AuralynControlSystem} />
        <Route path={ROUTES.LIVE_MONITOR}           component={LivePatientMonitor} />
        <Route path={ROUTES.COMMAND_CENTER}         component={HospitalCommandCenter} />
        <Route path="/command-center-v2">{() => <RoleGuard allowedRoles={["admin", "physician", "clinician"]}><CommandCenterV2Page /></RoleGuard>}</Route>
        <Route path="/command-center-v3">{() => <RoleGuard allowedRoles={["admin", "physician", "clinician"]}><CommandCenterV3Page /></RoleGuard>}</Route>
        <Route path="/command-center-v4">{() => <RoleGuard allowedRoles={["admin", "physician", "clinician"]}><CommandCenterV4Page /></RoleGuard>}</Route>
        <Route path="/nyc-pilot">{() => <RoleGuard allowedRoles={["admin", "physician"]}><NYCPilotPage /></RoleGuard>}</Route>
        <Route path="/hospital-wall">{() => <HospitalWallPage />}</Route>
        <Route path="/research-inbox">{() => <RoleGuard allowedRoles={["admin", "physician"]}><ResearchInboxPage /></RoleGuard>}</Route>
        <Route path="/agent-handoff">{() => <RoleGuard allowedRoles={["admin", "physician"]}><AgentHandoffPage /></RoleGuard>}</Route>
        <Route path="/cross-model-review">{() => <RoleGuard allowedRoles={["admin", "physician"]}><CrossModelReviewInbox /></RoleGuard>}</Route>
        <Route path="/slice-pipeline">{() => <RoleGuard allowedRoles={["admin", "physician"]}><SlicePipelineAdmin /></RoleGuard>}</Route>
        <Route path="/fda-audit">{() => <RoleGuard allowedRoles={["admin", "physician"]}><FDAAuditPage /></RoleGuard>}</Route>
        <Route path="/admin/claude-export">{() => <RoleGuard allowedRoles={["admin"]}><AdminClaudeExportPage /></RoleGuard>}</Route>
        <Route path={ROUTES.INTEGRATION_HEALTH}>{() => <RoleGuard allowedRoles={["admin"]}><IntegrationHealthPage /></RoleGuard>}</Route>
        <Route path={ROUTES.ENGINE_MAINTENANCE}>{() => <RoleGuard allowedRoles={["admin", "physician"]}><EngineMaintenancePage /></RoleGuard>}</Route>
        <Route path={ROUTES.AGENT_LAB}>{() => <RoleGuard allowedRoles={["admin", "physician"]}><AgentLabPage /></RoleGuard>}</Route>
        <Route path="/agent-brain">{() => <RoleGuard allowedRoles={["admin", "physician"]}><AgentBrainPage /></RoleGuard>}</Route>
        <Route path="/hardening-review">{() => <RoleGuard allowedRoles={["admin", "physician"]}><HardeningReviewPage /></RoleGuard>}</Route>
        <Route path={ROUTES.PHYSICIAN_COMMAND_STRIP}>{() => <RoleGuard allowedRoles={["admin", "physician", "clinician"]}><PhysicianCommandStrip /></RoleGuard>}</Route>
        <Route path={ROUTES.PATIENT_GRID}>{() => <RoleGuard allowedRoles={["admin", "physician", "clinician"]}><PatientGridPage /></RoleGuard>}</Route>
        <Route path={ROUTES.SYSTEM_OPS_GRID}>{() => <RoleGuard allowedRoles={["admin"]}><SystemOpsGridPage /></RoleGuard>}</Route>
        <Route path={ROUTES.KB_EXPLORER}>{() => <RoleGuard allowedRoles={["admin", "physician"]}><KBExplorerPage /></RoleGuard>}</Route>
        <Route path={ROUTES.CONVERSATION_OPTIMIZATION}>{() => <RoleGuard allowedRoles={["admin", "physician", "clinician"]}><ConversationOptimizationPage /></RoleGuard>}</Route>
        <Route path={ROUTES.GOLD_REVIEW}>{() => <RoleGuard allowedRoles={["admin", "physician", "clinician"]}><GoldReviewWorkbench /></RoleGuard>}</Route>
        <Route path={ROUTES.COMPACT_INTAKE} component={CompactIntakePage} />
        <Route path={ROUTES.MESSAGING_FLOW}>{() => <RoleGuard allowedRoles={["admin", "physician"]}><MessagingFlowPage /></RoleGuard>}</Route>
        <Route path={ROUTES.AI_INTERACTION_MONITOR}>{() => <RoleGuard allowedRoles={["admin", "physician"]}><AIInteractionMonitorPage /></RoleGuard>}</Route>
        <Route path="/system-monitor" component={SystemMonitorPage} />
        <Route path="/fda-dashboard" component={FDADashboardPage} />
        <Route path="/prior-auth" component={PriorAuthPage} />
        <Route path="/eligibility" component={EligibilityPage} />
        <Route path="/population-health" component={PopulationHealthPage} />
        <Route path="/experiments" component={ExperimentsPage} />
        <Route path="/voice-triage" component={VoiceTriagePage} />
        <Route path="/decision-tree" component={DecisionTreePage} />
        <Route path="/fda-dashboard" component={FDAValidationPage} />
        <Route path="/live-clinic" component={LiveClinicPage} />
        <Route path="/production-readiness" component={ProductionReadinessPage} />
        <Route path="/billing-intelligence" component={BillingIntelligencePage} />
        <Route path="/revenue-war-room">{() => <RoleGuard allowedRoles={["admin", "physician"]}><RevenueWarRoomPage /></RoleGuard>}</Route>
        <Route path="/system-war-room">{() => <RoleGuard allowedRoles={["admin"]}><SystemWarRoomPage /></RoleGuard>}</Route>
        <Route path="/orchestrator">{() => <RoleGuard allowedRoles={["admin"]}><OrchestratorPanel /></RoleGuard>}</Route>
        <Route path="/architectural-compliance" component={ArchitecturalCompliancePage} />
        <Route path="/moat-intelligence" component={MoatIntelligencePage} />
        <Route path="/executive-command">{() => <RoleGuard allowedRoles={["admin"]}><ExecutiveCommandPage /></RoleGuard>}</Route>
        <Route path="/workflow-builder" component={WorkflowBuilder} />
        <Route path="/workflow-canvas" component={WorkflowCanvas} />
        <Route path="/workflow-canvas-full" component={WorkflowCanvasFull} />
        <Route path="/smart-launch" component={SmartLaunch} />
        <Route path="/smart-callback" component={SmartCallback} />
        <Route path="/alert-rules" component={AlertRules} />
        <Route path="/epic-test" component={EpicTest} />
        <Route path="/multi-tenant" component={MultiTenantDashboard} />
        <Route path="/physician-copilot" component={PhysicianCopilot} />
        <Route path="/admin-panel" component={AdminPanel} />
        <Route path="/ui-automation" component={UIAutomationPanel} />
        <Route path="/control-tower" component={ControlTower} />
        <Route path="/master-control" component={MasterControl} />
        <Route path="/icu-control-tower" component={ICUControlTower} />
        <Route path="/validation-dashboard" component={ValidationDashboard} />
        <Route path="/network-control-tower" component={NetworkControlTower} />
        <Route path="/kb-review-dashboard" component={KBReviewDashboard} />
        <Route path="/deep-agent" component={DeepAgentDashboard} />
        <Route path="/communication" component={CommunicationDashboard} />
        <Route path="/routing-telemetry" component={RoutingTelemetryDashboard} />
        <Route path="/clinical-icu-monitor" component={ClinicalICUMonitor} />
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
      <Route path="/care/:shareToken" component={PatientLivingEncounter} />
      <Route path="/intake/:token" component={PatientIntake} />
      <Route path="/simple/:token" component={SimpleIntake} />
      <Route path="/intake/:token/status" component={IntakeStatus} />
      <Route path="/intake/:token/summary" component={IntakeSummary} />
      <Route path="/provider/case" component={ProviderCaseView} />
      <Route path="/provider/case/:caseId" component={ProviderCaseView} />
      <Route path="/chat-intake" component={PatientIntakeChat} />
      <Route path="/patient-ai-chat" component={PatientAIChat} />
      <Route path="/portal" component={HomePortal} />
      <Route path="/portal/provider">
        {() => <PortalRouter role="provider" />}
      </Route>
      <Route path="/portal/patient">
        {() => <PortalRouter role="patient" />}
      </Route>
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
          <AuralynCommandInterface physicianId="phys1" />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
