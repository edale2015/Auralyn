import { getTable } from "../../data/registry";

type Row = Record<string, any>;

export interface RedFlagMasterEntry {
  rfId: string;
  severity: string;
  templateId: string;
  title: string;
  immediateActionsCanonical: string[];
}

export async function joinRedFlagsToMaster(flagIds: string[]): Promise<RedFlagMasterEntry[]> {
  if (!flagIds.length) return [];

  const masterRows: Row[] = await getTable("RED_FLAGS_MASTER");

  const byId = new Map<string, Row>();
  for (const r of masterRows) {
    const id = String(r.RF_MASTER_ID || r.RF_ID || r.Id || r.ID || "");
    if (id) byId.set(id, r);
  }

  return flagIds.map(id => {
    const m = byId.get(id);
    return {
      rfId: id,
      severity: String(m?.SEVERITY || m?.severity || "UNKNOWN"),
      templateId: String(m?.TEMPLATE_ID || m?.TEMPLATE || ""),
      title: String(m?.TITLE || m?.Title || "Safety concern"),
      immediateActionsCanonical: m
        ? String(m.IMMEDIATE_ACTIONS || m.immediateActions || "")
            .split(";").map((s: string) => s.trim()).filter(Boolean)
        : [],
    };
  });
}
