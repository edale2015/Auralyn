import fs from "fs";
import path from "path";
import yaml from "js-yaml";

export interface FlowStep {
  parallel?:   string[];
  sequential?: string[];
}

export interface PipelineConfig {
  name:    string;
  agents:  string[];
  flow:    FlowStep[];
  meta?:   Record<string, unknown>;
}

export function loadPipeline(filePath: string): PipelineConfig {
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  const content = fs.readFileSync(resolved, "utf8");
  return yaml.load(content) as PipelineConfig;
}

export function parsePipeline(yamlText: string): PipelineConfig {
  return yaml.load(yamlText) as PipelineConfig;
}
