export const crmTaskTypes = ['WHATSAPP', 'PHONE', 'EMAIL', 'MEETING_PREP', 'OTHER'] as const;
export const crmTaskPriorities = ['LOW', 'NORMAL', 'HIGH'] as const;
export type CrmTaskTypeValue = (typeof crmTaskTypes)[number];
export type CrmTaskPriority = (typeof crmTaskPriorities)[number];
export type CrmQueuePeriod = 'ALL' | 'OVERDUE' | 'TODAY' | 'FUTURE';

export type CrmTaskCreateInput = {
  leadId: string;
  title: string;
  type: CrmTaskTypeValue;
  priority: CrmTaskPriority;
  dueDate: Date;
  assigneeId: string;
};

export type CrmQueueItem = {
  kind: 'TASK' | 'FOLLOW_UP';
  id: string;
  leadId: string;
  leadName: string;
  title: string;
  dueDate: Date | string;
  priority: CrmTaskPriority;
  assigneeId: string;
  assigneeName: string;
  state: 'PENDING';
};

export type CrmQueueFilters = {
  assigneeId?: string | null;
  period?: CrmQueuePeriod;
};

type CreateInputParseResult = { ok: true; value: CrmTaskCreateInput } | { ok: false; field: keyof CrmTaskCreateInput };

function nonEmptyString(value: unknown, maxLength = 200): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

export function parseCrmTaskCreateInput(value: unknown): CreateInputParseResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, field: 'leadId' };
  const input = value as Record<string, unknown>;
  if (!nonEmptyString(input.leadId, 128)) return { ok: false, field: 'leadId' };
  if (!nonEmptyString(input.title, 160)) return { ok: false, field: 'title' };
  if (typeof input.type !== 'string' || !crmTaskTypes.includes(input.type as CrmTaskTypeValue)) return { ok: false, field: 'type' };
  if (typeof input.priority !== 'string' || !crmTaskPriorities.includes(input.priority as CrmTaskPriority)) return { ok: false, field: 'priority' };
  if (!nonEmptyString(input.assigneeId, 128)) return { ok: false, field: 'assigneeId' };
  if (typeof input.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.dueDate)) {
    return { ok: false, field: 'dueDate' };
  }
  const calendarDate = new Date(`${input.dueDate.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(calendarDate.valueOf()) || calendarDate.toISOString().slice(0, 10) !== input.dueDate.slice(0, 10)) {
    return { ok: false, field: 'dueDate' };
  }
  const dueDate = new Date(input.dueDate);
  if (!Number.isFinite(dueDate.valueOf())) return { ok: false, field: 'dueDate' };

  return { ok: true, value: {
    leadId: input.leadId.trim(),
    title: input.title.trim(),
    type: input.type as CrmTaskTypeValue,
    priority: input.priority as CrmTaskPriority,
    dueDate,
    assigneeId: input.assigneeId.trim()
  } };
}

const saoPauloCalendarDate = new Intl.DateTimeFormat('en', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
});

function calendarDateKey(value: Date): string {
  const parts = saoPauloCalendarDate.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function validDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.valueOf()) ? date : null;
}

function comparePriority(a: CrmTaskPriority, b: CrmTaskPriority): number {
  const rank: Record<CrmTaskPriority, number> = { HIGH: 3, NORMAL: 2, LOW: 1 };
  return rank[b] - rank[a];
}

export function filterAndSortCrmQueue<T extends CrmQueueItem>(items: readonly T[], filters: CrmQueueFilters, now = new Date()): T[] {
  const today = calendarDateKey(now);
  const filtered = items.filter((item) => {
    if (filters.assigneeId && item.assigneeId !== filters.assigneeId) return false;
    const dueDate = validDate(item.dueDate);
    if (!dueDate) return false;
    if (dueDate.valueOf() < now.valueOf()) return filters.period !== 'TODAY' && filters.period !== 'FUTURE';
    const itemDay = calendarDateKey(dueDate);
    if (filters.period === 'OVERDUE') return false;
    if (filters.period === 'TODAY') return itemDay === today;
    if (filters.period === 'FUTURE') return itemDay > today;
    return true;
  });

  return filtered.sort((a, b) => {
    const dueA = validDate(a.dueDate)?.valueOf() ?? Number.POSITIVE_INFINITY;
    const dueB = validDate(b.dueDate)?.valueOf() ?? Number.POSITIVE_INFINITY;
    return dueA - dueB || comparePriority(a.priority, b.priority) || a.id.localeCompare(b.id);
  });
}
