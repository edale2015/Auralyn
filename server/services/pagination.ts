export type PaginationParams = {
  page?: number;
  pageSize?: number;
};

export interface PaginatedResult<T> {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: T[];
}

export function paginate<T>(
  rows: T[],
  params: PaginationParams
): PaginatedResult<T> {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    page,
    pageSize,
    total: rows.length,
    totalPages: Math.ceil(rows.length / pageSize),
    items: rows.slice(start, end),
  };
}
