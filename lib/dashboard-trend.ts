import type { DashboardRange, MetricLead, MetricStageEvent } from './metrics';
import { isInterestStage } from './funnel';
import { getLocalDayWindow } from './goal-periods';

export type DashboardTrendPeriod = 'day' | 'week' | 'month';
export type DashboardTrendPoint = { label: string; approaches: number; interests: number };

export function getDashboardTrendSegmentIndex(progress: number, pointCount: number): number | null {
  if (pointCount < 2 || !Number.isFinite(progress)) return null;
  const boundedProgress = Math.min(1, Math.max(0, progress));
  return Math.min(pointCount - 2, Math.max(0, Math.ceil(boundedProgress * (pointCount - 1)) - 1));
}

type Bucket = DashboardTrendPoint & { start: Date; end: Date };
const businessTimeZone = 'America/Sao_Paulo';

function getDayBuckets(range: DashboardRange): Bucket[] {
  const buckets: Bucket[] = [];
  let cursor = range.start;

  while (cursor < range.end && buckets.length < 32) {
    const localDay = getLocalDayWindow(cursor);
    const start = cursor > localDay.start ? cursor : localDay.start;
    const end = localDay.end < range.end ? localDay.end : range.end;
    if (end <= cursor) break;
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: businessTimeZone, weekday: 'short', day: '2-digit'
    }).formatToParts(start);
    const weekday = parts.find((part) => part.type === 'weekday')?.value.replace('.', '') ?? '';
    const day = parts.find((part) => part.type === 'day')?.value ?? '';
    buckets.push({ start, end, label: `${weekday} ${day}`, approaches: 0, interests: 0 });
    cursor = end;
  }

  return buckets;
}

function createBuckets(range: DashboardRange, period: DashboardTrendPeriod): Bucket[] {
  if (range.end <= range.start) return [];

  if (period === 'day') {
    const duration = range.end.getTime() - range.start.getTime();
    return Array.from({ length: 6 }, (_, index) => {
      const start = new Date(range.start.getTime() + duration * index / 6);
      const end = new Date(range.start.getTime() + duration * (index + 1) / 6);
      const label = new Intl.DateTimeFormat('pt-BR', {
        timeZone: businessTimeZone, hour: '2-digit', hourCycle: 'h23'
      }).format(start);
      return { start, end, label: `${label}h`, approaches: 0, interests: 0 };
    });
  }

  const days = getDayBuckets(range);
  if (period === 'week') return days;

  const weeks: Bucket[] = [];
  for (let index = 0; index < days.length; index += 7) {
    const groupedDays = days.slice(index, index + 7);
    if (!groupedDays.length) continue;
    const first = groupedDays[0];
    const last = groupedDays[groupedDays.length - 1];
    const firstDay = first.label.slice(-2);
    const lastDay = last.label.slice(-2);
    weeks.push({
      start: first.start,
      end: last.end,
      label: `${firstDay}–${lastDay}`,
      approaches: 0,
      interests: 0
    });
  }
  return weeks;
}

function bucketFor(buckets: Bucket[], date: Date): Bucket | undefined {
  return buckets.find(({ start, end }) => date >= start && date < end);
}

export function getDashboardTrend(leads: MetricLead[], range: DashboardRange, period: DashboardTrendPeriod): DashboardTrendPoint[] {
  const buckets = createBuckets(range, period);
  if (!buckets.length) return [];

  for (const lead of leads) {
    for (const activity of lead.activities) {
      if (activity.type && activity.type !== 'CONTACT') continue;
      const bucket = bucketFor(buckets, activity.createdAt);
      if (bucket) bucket.approaches += 1;
    }

    const history = lead.stageHistory?.length ? lead.stageHistory : (lead.activities ?? []).flatMap((activity) => {
      if (activity.type && activity.type !== 'STAGE_CHANGE') return [];
      const match = activity.note?.match(/^Etapa alterada para (INTEREST|IN_CONVERSATION|MEETING|FOLLOW_UP)\.$/);
      return match ? [{ actorId: activity.actorId, toStage: match[1] as MetricStageEvent['toStage'], createdAt: activity.createdAt }] : [];
    });

    for (const event of history) {
      if (!isInterestStage(event.toStage)) continue;
      const bucket = bucketFor(buckets, event.createdAt);
      if (bucket) bucket.interests += 1;
    }
  }

  return buckets.map(({ label, approaches, interests }) => ({ label, approaches, interests }));
}
