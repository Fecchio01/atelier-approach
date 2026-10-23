const timeZone = 'America/Sao_Paulo';

type DateTimeParts = { year: number; month: number; day: number; hour: number; minute: number };

function partsInSaoPaulo(value: Date): DateTimeParts {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour'), minute: read('minute') };
}

function sameParts(a: DateTimeParts, b: DateTimeParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour && a.minute === b.minute;
}

function wallClockAsUtc(parts: DateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

export function parseCrmTaskLocalDateTime(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const desired: DateTimeParts = { year: Number(yearText), month: Number(monthText), day: Number(dayText), hour: Number(hourText), minute: Number(minuteText) };
  const calendar = new Date(Date.UTC(desired.year, desired.month - 1, desired.day));
  if (calendar.getUTCFullYear() !== desired.year || calendar.getUTCMonth() + 1 !== desired.month || calendar.getUTCDate() !== desired.day || desired.hour > 23 || desired.minute > 59) return null;

  const targetWallClock = wallClockAsUtc(desired);
  let instant = targetWallClock;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const observed = partsInSaoPaulo(new Date(instant));
    const adjustment = targetWallClock - wallClockAsUtc(observed);
    if (adjustment === 0) break;
    instant += adjustment;
  }
  const result = new Date(instant);
  return sameParts(partsInSaoPaulo(result), desired) ? result : null;
}

export function formatCrmTaskDateTimeInput(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.valueOf())) return '';
  const parts = partsInSaoPaulo(date);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${String(parts.year).padStart(4, '0')}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}
