const meetingTimeZone = 'America/Sao_Paulo';

export function parseMeetingAt(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new RangeError('Data e hora da reunião inválidas.');

  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) throw new RangeError('Data e hora da reunião inválidas.');
  return date;
}

export function formatMeetingDateTimeLocal(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.valueOf())) return '';

  const parts = new Intl.DateTimeFormat('en', {
    timeZone: meetingTimeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
