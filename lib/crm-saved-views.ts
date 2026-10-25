import type { CrmBoardFilter, CrmBoardSort } from '@/lib/crm-board-view';
import type { CrmSavedViewScope as PrismaCrmSavedViewScope } from '@prisma/client';
import type { CrmQueuePeriod } from '@/lib/crm-task-queue';

export type CrmSavedViewScope = PrismaCrmSavedViewScope;
export type CrmActionAssignment = 'ALL' | 'MINE';
export type CrmActionViewMode = 'LIST' | 'CALENDAR';

export type CrmFunnelSavedFilters = {
  searchQuery: string;
  boardFilter: CrmBoardFilter;
  sortOrder: CrmBoardSort;
};

export type CrmActionsSavedFilters = {
  assignment: CrmActionAssignment;
  period: CrmQueuePeriod;
  view: CrmActionViewMode;
};

export type CrmSavedViewFilters = CrmFunnelSavedFilters | CrmActionsSavedFilters;

export type CrmSavedViewRecord = {
  id: string;
  scope: CrmSavedViewScope;
  name: string;
  filters: CrmSavedViewFilters;
  createdAt: string;
  updatedAt: string;
};

export const crmSavedViewScopes = ['FUNNEL', 'ACTIONS'] as const;
const boardFilters: CrmBoardFilter[] = ['all', 'with-next-action', 'without-next-action', 'has-contact', 'proposals-without-next-action'];
const boardSorts: CrmBoardSort[] = ['current', 'next-action', 'oldest-stage', 'sale-value', 'name'];
const queuePeriods: CrmQueuePeriod[] = ['ALL', 'OVERDUE', 'TODAY', 'FUTURE'];

export function isCrmSavedViewScope(value: unknown): value is CrmSavedViewScope {
  return typeof value === 'string' && crmSavedViewScopes.includes(value as CrmSavedViewScope);
}

export function parseCrmSavedViewFilters(scope: CrmSavedViewScope, value: unknown): CrmSavedViewFilters | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;

  if (scope === 'FUNNEL') {
    if (typeof input.searchQuery !== 'string' || input.searchQuery.length > 120) return null;
    if (typeof input.boardFilter !== 'string' || !boardFilters.includes(input.boardFilter as CrmBoardFilter)) return null;
    if (typeof input.sortOrder !== 'string' || !boardSorts.includes(input.sortOrder as CrmBoardSort)) return null;
    return {
      searchQuery: input.searchQuery.trim(),
      boardFilter: input.boardFilter as CrmBoardFilter,
      sortOrder: input.sortOrder as CrmBoardSort
    };
  }

  if (input.assignment !== 'ALL' && input.assignment !== 'MINE') return null;
  if (typeof input.period !== 'string' || !queuePeriods.includes(input.period as CrmQueuePeriod)) return null;
  if (input.view !== 'LIST' && input.view !== 'CALENDAR') return null;
  return {
    assignment: input.assignment,
    period: input.period as CrmQueuePeriod,
    view: input.view
  };
}

export function parseCrmSavedViewName(value: unknown): { name: string; normalizedName: string } | null {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 40) return null;
  return { name, normalizedName: name.toLocaleLowerCase('pt-BR') };
}

export function sameCrmSavedViewFilters(left: CrmSavedViewFilters, right: CrmSavedViewFilters): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
