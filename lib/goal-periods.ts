const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

export type GoalPeriodKind = 'WEEKLY' | 'MONTHLY';

export interface GoalPeriodWindow {
  kind: GoalPeriodKind;
  start: Date;
  end: Date;
}

export type DashboardPeriod = 'day' | 'week' | 'month';


interface LocalDate {
  year: number;
  month: number;
  day: number;
}

const calendarFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function getLocalDate(date: Date): LocalDate {
  const parts = calendarFormatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);

  return { year: value('year'), month: value('month'), day: value('day') };
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addCalendarDays(date: LocalDate, amount: number): LocalDate {
  const result = new Date(Date.UTC(date.year, date.month - 1, date.day + amount));
  return { year: result.getUTCFullYear(), month: result.getUTCMonth() + 1, day: result.getUTCDate() };
}

function addCalendarMonths(year: number, month: number, amount: number): Pick<LocalDate, 'year' | 'month'> {
  const result = new Date(Date.UTC(year, month - 1 + amount, 1));
  return { year: result.getUTCFullYear(), month: result.getUTCMonth() + 1 };
}

function localMidnightToUtc(localDate: LocalDate): Date {
  const targetAsUtc = Date.UTC(localDate.year, localDate.month - 1, localDate.day);
  let candidate = targetAsUtc;

  // Resolve the zone offset at the target instant instead of assuming a fixed
  // UTC-3 offset; historical São Paulo dates include daylight-saving changes.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(candidate));
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
    const representedAsUtc = Date.UTC(
      value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second')
    );
    const offset = representedAsUtc - candidate;
    const next = targetAsUtc - offset;
    if (next === candidate) break;
    candidate = next;
  }

  return new Date(candidate);
}

function monthlyBoundary(year: number, month: number, startDay: number): Date {
  return localMidnightToUtc({ year, month, day: Math.min(startDay, getDaysInMonth(year, month)) });
}

function validateMonthlyStartDay(monthlyStartDay: number): void {
  if (!Number.isInteger(monthlyStartDay) || monthlyStartDay < 1 || monthlyStartDay > 31) {
    throw new RangeError('O dia de início do ciclo mensal deve ser um inteiro entre 1 e 31.');
  }
}

export function getGoalPeriodWindow(
  kind: GoalPeriodKind,
  reference: Date,
  monthlyStartDay: number,
  activeStart?: Date
): GoalPeriodWindow {
  validateMonthlyStartDay(monthlyStartDay);
  if (Number.isNaN(reference.getTime())) throw new RangeError('A data de referência é inválida.');

  const localReference = getLocalDate(reference);

  if (kind === 'WEEKLY') {
    const referenceWeekday = new Date(Date.UTC(localReference.year, localReference.month - 1, localReference.day)).getUTCDay();
    const daysSinceMonday = (referenceWeekday + 6) % 7;
    const monday = addCalendarDays(localReference, -daysSinceMonday);
    const followingMonday = addCalendarDays(monday, 7);
    return {
      kind,
      start: localMidnightToUtc(monday),
      end: localMidnightToUtc(followingMonday)
    };
  }

  if (kind !== 'MONTHLY') throw new RangeError('Tipo de período inválido.');

  if (activeStart) {
    const month = addCalendarMonths(localReference.year, localReference.month, 0);
    const thisMonthAnchor = monthlyBoundary(month.year, month.month, monthlyStartDay);
    const nextAnchor = thisMonthAnchor.getTime() > reference.getTime()
      ? thisMonthAnchor
      : (() => {
        const nextMonth = addCalendarMonths(month.year, month.month, 1);
        return monthlyBoundary(nextMonth.year, nextMonth.month, monthlyStartDay);
      })();

    if (activeStart.getTime() >= nextAnchor.getTime()) {
      throw new RangeError('O início do ciclo ativo deve ser anterior ao próximo limite mensal.');
    }

    return { kind, start: activeStart, end: nextAnchor };
  }

  const thisMonthStart = monthlyBoundary(localReference.year, localReference.month, monthlyStartDay);
  if (thisMonthStart.getTime() <= reference.getTime()) {
    const nextMonth = addCalendarMonths(localReference.year, localReference.month, 1);
    return {
      kind,
      start: thisMonthStart,
      end: monthlyBoundary(nextMonth.year, nextMonth.month, monthlyStartDay)
    };
  }

  const previousMonth = addCalendarMonths(localReference.year, localReference.month, -1);
  return {
    kind,
    start: monthlyBoundary(previousMonth.year, previousMonth.month, monthlyStartDay),
    end: thisMonthStart
  };
}

export function getLocalDayWindow(reference: Date): { start: Date; end: Date } {
  if (Number.isNaN(reference.getTime())) throw new RangeError('A data de referência é inválida.');
  const localDate = getLocalDate(reference);
  return {
    start: localMidnightToUtc(localDate),
    end: localMidnightToUtc(addCalendarDays(localDate, 1))
  };
}

export function selectDashboardWindow(
  period: DashboardPeriod,
  reference: Date,
  weeklyWindow: GoalPeriodWindow,
  monthlyWindow: GoalPeriodWindow
): { start: Date; end: Date } {
  if (period === 'day') return getLocalDayWindow(reference);
  const selectedWindow = period === 'week' ? weeklyWindow : monthlyWindow;
  return { start: selectedWindow.start, end: selectedWindow.end };
}

export function selectGoalPeriod<T extends { periodStart: Date }>(
  requestedStart: Date | null,
  requestedGoal: T | null,
  activeGoal: T | null
): T | null {
  return requestedStart ? requestedGoal : activeGoal;
}


export function isSameLocalDay(first: Date, second: Date): boolean {
  if (Number.isNaN(first.getTime()) || Number.isNaN(second.getTime())) return false;
  const firstDate = getLocalDate(first);
  const secondDate = getLocalDate(second);
  return firstDate.year === secondDate.year && firstDate.month === secondDate.month && firstDate.day === secondDate.day;
}
