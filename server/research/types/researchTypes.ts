export type SourceTier = 1 | 2 | 3 | 4;
export type EvidenceStrength = 'high' | 'moderate' | 'low' | 'unknown';
export type RelationType = 'causes' | 'indicates' | 'rules_out' | 'requires' | 'treats' | 'worsens' | 'associated_with';

export interface EdgeProvenance {
  sourceId: string;
  sourceTitle: string;
  extractedAt: string;
  evidenceStrength: EvidenceStrength;
  reviewedByHuman: boolean;
  approvedForClinicalUse: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface KnowledgeEdge {
  id?: string;
  from: string;
  to: string;
  relation: RelationType;
  confidence?: number;
  provenance: EdgeProvenance;
}

export interface ResearchSource {
  id: string;
  title: string;
  sourceType:
    | 'guideline'
    | 'review'
    | 'flowchart'
    | 'sheet'
    | 'journalism'
    | 'commentary'
    | 'forum'
    | 'patient_language';
  authorityTier: SourceTier;
  domain: 'clinical_rule' | 'patient_language' | 'trend_surveillance';
  url?: string;
  uploadedFilePath?: string;
  citation?: string;
  versionDate?: string;
  addedBy: string;
  requiresHumanReview: boolean;
  active: boolean;
  addedAt: string;
  description?: string;
  edgeCount?: number;
}

export interface IngestionResult {
  edges: KnowledgeEdge[];
  linesProcessed: number;
  edgesExtracted: number;
  sourceId: string;
}

export interface ValidationResult {
  safe: KnowledgeEdge[];
  rejected: KnowledgeEdge[];
  rejectionReasons: Record<string, string>;
}

export interface PromotionResult {
  promoted: KnowledgeEdge[];
  pendingReview: KnowledgeEdge[];
  totalPromoted: number;
}

export interface DistillationResult {
  summaryBullets: string[];
  topThemes: { word: string; count: number }[];
  medicalTermsDetected: string[];
  commentCount: number;
}

export interface SupervisorState {
  entropy?: number;
  tests?: string[];
  redFlags?: string[];
  safetyTriggered?: boolean;
  disposition?: string;
  differentials?: { diagnosis: string; score: number }[];
  questionCompleteness?: number;
}

export type SupervisorDecision = 'APPROVED' | 'REVIEW_REQUIRED' | 'BLOCK';

export interface MetaSupervisorResult {
  supervisorDecision: SupervisorDecision;
  flags: string[];
  escalationReason?: string;
  recommendedActions: string[];
  confidence: 'high' | 'moderate' | 'low';
}
