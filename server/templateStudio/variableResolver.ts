import type { TemplateVariableBinding, TemplateVariableDefinition, VariableResolutionResult } from "../../shared/templateStudio";
import { SecretStore } from "./secretStore";

export class VariableResolver {
  constructor(private secretStore: SecretStore) {}

  async resolve(
    defs: TemplateVariableDefinition[] = [],
    runtimeBindings: TemplateVariableBinding[] = [],
    env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
  ): Promise<VariableResolutionResult> {
    const resolved: Record<string, string> = {};
    const missing: string[] = [];
    const usedSecrets: string[] = [];
    const runtimeMap = new Map(runtimeBindings.map(b => [b.key, b]));

    for (const def of defs) {
      const binding = runtimeMap.get(def.key);

      if (binding?.sourceType === "runtime" && binding.value != null) {
        resolved[def.key] = binding.value;
        continue;
      }
      if (binding?.sourceType === "secret" && binding.secretRef) {
        const secret = await this.secretStore.resolve(binding.secretRef);
        if (secret != null) { resolved[def.key] = secret; usedSecrets.push(binding.secretRef); continue; }
      }
      if (def.sourceType === "secret" && def.secretRef) {
        const secret = await this.secretStore.resolve(def.secretRef);
        if (secret != null) { resolved[def.key] = secret; usedSecrets.push(def.secretRef); continue; }
      }
      if (def.sourceType === "environment") {
        const value = env[def.key];
        if (value != null) { resolved[def.key] = value; continue; }
      }
      if (def.sourceType === "static" && def.defaultValue != null) {
        resolved[def.key] = def.defaultValue;
        continue;
      }
      if (def.required) missing.push(def.key);
    }

    return { resolved, missing, usedSecrets };
  }

  interpolate(text: string, values: Record<string, string>): string {
    return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key) => values[key] ?? "");
  }

  interpolateObject<T>(input: T, values: Record<string, string>): T {
    if (typeof input === "string") return this.interpolate(input, values) as T;
    if (Array.isArray(input)) return input.map(v => this.interpolateObject(v, values)) as T;
    if (input && typeof input === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        out[k] = this.interpolateObject(v, values);
      }
      return out as T;
    }
    return input;
  }
}
