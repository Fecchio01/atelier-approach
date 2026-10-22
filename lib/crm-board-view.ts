export type CrmBoardSort = 'current' | 'next-action' | 'oldest-stage' | 'sale-value' | 'name';
export type CrmBoardFilter = 'all' | 'with-next-action' | 'without-next-action' | 'has-contact';

type SortableLead = {
  id: string;
  name: string | null;
  nextActionAt?: string | Date | null;
  stageEnteredAt?: string | Date | null;
  saleValue: string | number | null;
};

function timestamp(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareNullableNumber(left: number | null, right: number | null, direction: 'asc' | 'desc' = 'asc') {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === 'asc' ? left - right : right - left;
}

function compareNames(left: string | null, right: string | null) {
  return (left ?? '').localeCompare(right ?? '', 'pt-BR', { sensitivity: 'base', numeric: true });
}

export function sortCrmBoardLeads<T extends SortableLead>(leads: T[], order: CrmBoardSort): T[] {
  if (order === 'current') return leads;

  return [...leads].sort((left, right) => {
    let comparison = 0;
    if (order === 'next-action') {
      comparison = compareNullableNumber(timestamp(left.nextActionAt), timestamp(right.nextActionAt));
      if (!comparison) comparison = compareNullableNumber(timestamp(left.stageEnteredAt), timestamp(right.stageEnteredAt));
    } else if (order === 'oldest-stage') {
      comparison = compareNullableNumber(timestamp(left.stageEnteredAt), timestamp(right.stageEnteredAt));
    } else if (order === 'sale-value') {
      const leftValue = left.saleValue === null ? null : Number(left.saleValue);
      const rightValue = right.saleValue === null ? null : Number(right.saleValue);
      comparison = compareNullableNumber(Number.isFinite(leftValue) ? leftValue : null, Number.isFinite(rightValue) ? rightValue : null, 'desc');
    } else if (order === 'name') {
      comparison = compareNames(left.name, right.name);
    }

    return comparison || left.id.localeCompare(right.id);
  });
}

type FilterableLead = {
  nextActionAt?: string | Date | null;
  phone: string | null;
  whatsapp: string | null;
};

export function filterCrmBoardLeads<T extends FilterableLead>(leads: T[], filter: CrmBoardFilter): T[] {
  if (filter === 'all') return leads;
  if (filter === 'with-next-action') return leads.filter((lead) => Boolean(lead.nextActionAt));
  if (filter === 'without-next-action') return leads.filter((lead) => !lead.nextActionAt);
  if (filter === 'has-contact') return leads.filter((lead) => Boolean(lead.phone?.trim() || lead.whatsapp?.trim()));
  return leads;
}

