const millisecondsPerDay = 24 * 60 * 60 * 1000;
// Ten years bounds scheduling to a useful, Date-safe commercial horizon.
export const MAX_FOLLOW_UP_DELAY_DAYS = 3650;
export function isValidFollowUpDelay(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_FOLLOW_UP_DELAY_DAYS;
}

export function getFollowUpDueDate(now: Date, delayDays: number): Date {
  if (!Number.isFinite(now.valueOf()) || !isValidFollowUpDelay(delayDays)) {
    throw new RangeError('A data e o intervalo do follow-up devem ser válidos.');
  }

  const dueDate = new Date(now.valueOf() + delayDays * millisecondsPerDay);
  if (!Number.isFinite(dueDate.valueOf())) {
    throw new RangeError('A data calculada do follow-up está fora do intervalo válido.');
  }
  return dueDate;
}
