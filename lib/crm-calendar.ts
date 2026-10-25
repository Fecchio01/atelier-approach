const crmCalendarTimeZone = 'America/Sao_Paulo';

export type CrmCalendarDayKey = `${number}-${string}-${string}`;

const dayKeyFormatter = new Intl.DateTimeFormat('en', {
  timeZone: crmCalendarTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function isValidDayKey(value: string): value is CrmCalendarDayKey {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() + 1 === Number(month)
    && date.getUTCDate() === Number(day);
}

export function getCrmCalendarDayKey(value: Date | string): CrmCalendarDayKey | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.valueOf())) return null;
  const parts = dayKeyFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(({ type: partType }) => partType === type)?.value ?? '';
  const key = `${part('year')}-${part('month')}-${part('day')}`;
  return isValidDayKey(key) ? key : null;
}

export function shiftCrmCalendarDayKey(value: string, days: number): CrmCalendarDayKey | null {
  if (!isValidDayKey(value) || !Number.isInteger(days)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12));
  const key = `${String(shifted.getUTCFullYear()).padStart(4, '0')}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
  return isValidDayKey(key) ? key : null;
}

export function getCrmCalendarWeek(value: string): CrmCalendarDayKey[] {
  if (!isValidDayKey(value)) return [];
  const [year, month, day] = value.split('-').map(Number);
  const carrier = new Date(Date.UTC(year, month - 1, day, 12));
  const daysSinceMonday = (carrier.getUTCDay() + 6) % 7;
  const monday = shiftCrmCalendarDayKey(value, -daysSinceMonday);
  if (!monday) return [];
  return Array.from({ length: 7 }, (_, index) => shiftCrmCalendarDayKey(monday, index)).filter((dayKey): dayKey is CrmCalendarDayKey => dayKey !== null);
}

export function formatCrmCalendarDayKey(value: string, options: Intl.DateTimeFormatOptions = {}): string {
  if (!isValidDayKey(value)) return 'Data inválida';
  const [year, month, day] = value.split('-').map(Number);
  // Noon UTC is a stable carrier for the literal calendar day; avoid browser-local date shifts.
  const carrier = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...options }).format(carrier);
}
