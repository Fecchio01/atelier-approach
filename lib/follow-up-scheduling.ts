const millisecondsPerDay = 24 * 60 * 60 * 1000;

export function getFollowUpDueDate(now: Date, delayDays: number): Date {
  if (!Number.isFinite(now.valueOf()) || !Number.isInteger(delayDays) || delayDays < 1) {
    throw new RangeError('A data e o intervalo do follow-up devem ser válidos.');
  }

  const dueDate = new Date(now.valueOf() + delayDays * millisecondsPerDay);
  if (!Number.isFinite(dueDate.valueOf())) {
    throw new RangeError('A data calculada do follow-up está fora do intervalo válido.');
  }
  return dueDate;
}
