export type ModuleToggleMap = Record<string, boolean>;

export const DEFAULT_MODULE_TOGGLES: ModuleToggleMap = {
  intake: true,
  triage: true,
  reasoning: true,
  output: true,
  outcomes: true,
  analytics: true,
};

export function isModuleEnabled(moduleName: string, toggles?: ModuleToggleMap): boolean {
  const map = toggles ?? DEFAULT_MODULE_TOGGLES;
  return map[moduleName] !== false;
}
