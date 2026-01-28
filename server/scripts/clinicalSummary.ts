import { getSheetRows } from "../sheets/sheetHelper";

type TabSpec = {
  tab: string;
  keyCols: string[];
  flowCol?: string;
  systemCol?: string;
};

const TABS: TabSpec[] = [
  { tab: "CLINICAL_QUESTIONS", keyCols: ["question_id"], flowCol: "flow_id", systemCol: "system" },
  { tab: "CLINICAL_RULES", keyCols: ["rule_key"], flowCol: "flow_id", systemCol: "system" },
  { tab: "CLINICAL_DIAGNOSES", keyCols: ["Diagnosis ID"], systemCol: "System" },
  { tab: "CLINICAL_MEDICATIONS", keyCols: ["Notes"], systemCol: "System" },
  { tab: "CLINICAL_MODIFIERS", keyCols: ["modifier_key"], systemCol: "scope" }, // global-ish; still counts
];

function norm(s: any) {
  return String(s ?? "").trim();
}

function inc(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

async function main() {
  const bySystem = new Map<string, Map<string, number>>(); // system -> tab -> count
  const byFlow = new Map<string, Map<string, number>>();   // flow -> tab -> count

  for (const spec of TABS) {
    try {
      const { rowsAsObjects } = await getSheetRows(spec.tab);

      for (const r of rowsAsObjects) {
        // Skip inactive rows if 'active' exists and is clearly false
        const active = norm((r as any).active);
        if (active && ["n", "no", "false", "0"].includes(active.toLowerCase())) continue;

        const system = spec.systemCol ? norm((r as any)[spec.systemCol]) : "";
        const flow = spec.flowCol ? norm((r as any)[spec.flowCol]) : "";

        // Count system totals
        if (system) {
          if (!bySystem.has(system)) bySystem.set(system, new Map());
          inc(bySystem.get(system)!, spec.tab, 1);
        }

        // Count flow totals
        if (flow) {
          if (!byFlow.has(flow)) byFlow.set(flow, new Map());
          inc(byFlow.get(flow)!, spec.tab, 1);
        }
      }
    } catch (err) {
      console.warn(`⚠️ Could not read ${spec.tab}: ${err}`);
    }
  }

  // Print system summary
  console.log("\n=== SYSTEM SUMMARY ===");
  const systems = Array.from(bySystem.keys()).sort();
  for (const s of systems) {
    const m = bySystem.get(s)!;
    const q = m.get("CLINICAL_QUESTIONS") || 0;
    const r = m.get("CLINICAL_RULES") || 0;
    const d = m.get("CLINICAL_DIAGNOSES") || 0;
    const meds = m.get("CLINICAL_MEDICATIONS") || 0;
    const mods = m.get("CLINICAL_MODIFIERS") || 0;
    console.log(`${s}: Questions=${q}, Rules=${r}, Diagnoses=${d}, Medications=${meds}, Modifiers=${mods}`);
  }

  // Print top flows (from questions tab presence)
  console.log("\n=== FLOW SUMMARY (from flow_id rows present) ===");
  const flows = Array.from(byFlow.keys()).sort();
  for (const f of flows) {
    const m = byFlow.get(f)!;
    const q = m.get("CLINICAL_QUESTIONS") || 0;
    const r = m.get("CLINICAL_RULES") || 0;
    console.log(`${f}: Questions=${q}, Rules=${r}`);
  }
}

main().catch((e) => {
  console.error("clinicalSummary failed:", e);
  process.exit(1);
});
