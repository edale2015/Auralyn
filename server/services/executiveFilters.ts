export type ExecutiveFilterInput = {
  clinicId?: string;
  startDate?: string;
  endDate?: string;
  complaint?: string;
  physicianId?: string;
};

export function applySnapshotFilters<T extends {
  clinicId?: string;
  snapshotDate?: string | Date;
}>(rows: T[], filters: ExecutiveFilterInput) {
  return rows.filter(row => {
    if (filters.clinicId && row.clinicId !== filters.clinicId) return false;
    if (filters.startDate) {
      const rowDate = new Date(row.snapshotDate || 0).getTime();
      if (rowDate < new Date(filters.startDate).getTime()) return false;
    }
    if (filters.endDate) {
      const rowDate = new Date(row.snapshotDate || 0).getTime();
      if (rowDate > new Date(filters.endDate).getTime()) return false;
    }
    return true;
  });
}

export function applyComplaintFilters<T extends {
  complaint?: string;
}>(rows: T[], filters: ExecutiveFilterInput) {
  return rows.filter(row => {
    if (filters.complaint && row.complaint !== filters.complaint) return false;
    return true;
  });
}

export function applyPhysicianFilters<T extends {
  physicianId?: string;
}>(rows: T[], filters: ExecutiveFilterInput) {
  return rows.filter(row => {
    if (filters.physicianId && row.physicianId !== filters.physicianId) return false;
    return true;
  });
}
