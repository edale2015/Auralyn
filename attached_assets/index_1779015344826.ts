/**
 * Auralyn Context Engineering — public API
 *
 * Drop this module into your project as `src/context/` (or wherever your
 * existing clinical pipeline lives) and import from here.
 */

export * from "./types";
export {
  ClinicalContextManager,
  estimateTokens,
} from "./ClinicalContextManager";
export {
  ContextCompactor,
  DEFAULT_POLICY as DEFAULT_COMPACTION_POLICY,
  type CompactionPolicy,
  type CompactionResult,
} from "./ContextCompactor";
export {
  AgentArtifactBus,
  ContractViolation,
} from "./AgentArtifactBus";
export {
  RoleScopedToolRegistry,
  AURALYN_DEFAULT_TOOLS,
  buildDefaultRegistry,
  type ToolSchema,
  type ToolParameter,
  ToolNamingViolation,
} from "./RoleScopedToolRegistry";
export {
  ClinicalMemoryStore,
  DEFAULT_DEMOTION_POLICY,
  type MemoryEntry,
  type MemoryScope,
  type MemoryStatus,
  type MemoryRetrievalQuery,
  type MemoryPersistence,
  type DemotionPolicy,
} from "./ClinicalMemoryStore";
