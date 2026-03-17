export interface CaseState {
  caseId: string;
  status: "intake" | "reasoning" | "decided" | "reviewed" | "closed";
  history: { layer: string; timestamp: number; data: any }[];
  createdAt: number;
  updatedAt: number;
}

const store: Record<string, CaseState> = {};

export class StateLayer {
  createCase(id: string): CaseState {
    store[id] = {
      caseId: id,
      status: "intake",
      history: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    return store[id];
  }

  getCase(id: string): CaseState | undefined {
    return store[id];
  }

  updateCase(id: string, layer: string, data: any): CaseState | undefined {
    if (!store[id]) return undefined;
    store[id].history.push({ layer, timestamp: Date.now(), data });
    store[id].updatedAt = Date.now();
    return store[id];
  }

  setStatus(id: string, status: CaseState["status"]): void {
    if (store[id]) {
      store[id].status = status;
      store[id].updatedAt = Date.now();
    }
  }

  getActiveCases(): CaseState[] {
    return Object.values(store).filter((c) => c.status !== "closed");
  }

  getAllCases(): CaseState[] {
    return Object.values(store);
  }
}

export const stateLayer = new StateLayer();
