export interface DashboardView {
  id: number;
  userId: string;
  clinicId: string;
  name: string;
  viewType: string;
  filters: unknown;
  createdAt: string;
}

const viewStore: DashboardView[] = [];
let viewId = 0;

export function saveDashboardView(payload: {
  userId: string;
  clinicId: string;
  name: string;
  viewType: string;
  filters: unknown;
}): DashboardView {
  viewId++;
  const row: DashboardView = {
    id: viewId,
    userId: payload.userId,
    clinicId: payload.clinicId,
    name: payload.name,
    viewType: payload.viewType,
    filters: payload.filters,
    createdAt: new Date().toISOString(),
  };
  viewStore.unshift(row);
  return row;
}

export function listDashboardViews(userId: string, clinicId: string): DashboardView[] {
  return viewStore.filter(v => v.userId === userId && v.clinicId === clinicId);
}

export function deleteDashboardView(id: number, userId: string): boolean {
  const idx = viewStore.findIndex(v => v.id === id && v.userId === userId);
  if (idx === -1) return false;
  viewStore.splice(idx, 1);
  return true;
}
