export interface SharedDashboardView {
  id: number;
  clinicId: string;
  createdByUserId: string;
  approvedByUserId?: string;
  name: string;
  viewType: string;
  filters: unknown;
  isApproved: boolean;
  createdAt: string;
  approvedAt?: string;
}

let nextId = 1;
const views: SharedDashboardView[] = [];

export function createSharedView(payload: {
  clinicId: string;
  createdByUserId: string;
  name: string;
  viewType: string;
  filters: unknown;
}): SharedDashboardView {
  const row: SharedDashboardView = {
    id: nextId++,
    ...payload,
    isApproved: false,
    createdAt: new Date().toISOString(),
  };
  views.push(row);
  return row;
}

export function listSharedViews(
  clinicId: string,
  approvedOnly = false
): SharedDashboardView[] {
  return views
    .filter((v) => v.clinicId === clinicId && (!approvedOnly || v.isApproved))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export function approveSharedView(
  id: number,
  approvedByUserId: string
): SharedDashboardView | null {
  const view = views.find((v) => v.id === id);
  if (!view) return null;
  view.isApproved = true;
  view.approvedByUserId = approvedByUserId;
  view.approvedAt = new Date().toISOString();
  return view;
}
