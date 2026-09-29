import { randomUUID } from 'node:crypto';
import type { DailyReport as PrismaDailyReport, Prisma } from '@prisma/client';

import { prisma } from './db';
import { getLocalDayWindow } from './goal-periods';
import { buildDailyReportSnapshot, type DailyReportSnapshot } from './reports';

export type DailyReportRecord = Omit<PrismaDailyReport, 'snapshot'> & { snapshot: DailyReportSnapshot };

function toDailyReportRecord(report: PrismaDailyReport): DailyReportRecord {
  return { ...report, snapshot: report.snapshot as unknown as DailyReportSnapshot };
}

export async function closeCurrentDailyReport(
  closedById: string,
  reference = new Date()
): Promise<{ report: DailyReportRecord; created: boolean }> {
  const { start: dayStart, end: dayEnd } = getLocalDayWindow(reference);
  const existing = await prisma.dailyReport.findUnique({ where: { dayStart } });
  if (existing) return { report: toDailyReportRecord(existing), created: false };

  const snapshot = await buildDailyReportSnapshot({ from: dayStart, to: dayEnd, closedAt: reference });
  const insertion = await prisma.dailyReport.createMany({
    data: [{
      id: randomUUID(),
      dayStart,
      dayEnd,
      closedAt: reference,
      closedById,
      snapshot: snapshot as unknown as Prisma.InputJsonValue
    }],
    skipDuplicates: true
  });
  const saved = await prisma.dailyReport.findUnique({ where: { dayStart } });
  if (!saved) throw new Error('O relatório diário não foi persistido.');

  return { report: toDailyReportRecord(saved), created: insertion.count === 1 };
}

export async function getDailyReportForDate(date: Date): Promise<DailyReportRecord | null> {
  const { start: dayStart } = getLocalDayWindow(date);
  const report = await prisma.dailyReport.findUnique({ where: { dayStart } });
  return report ? toDailyReportRecord(report) : null;
}

export async function listRecentDailyReports(limit = 30): Promise<DailyReportRecord[]> {
  const take = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 90) : 30;
  const reports = await prisma.dailyReport.findMany({ orderBy: { dayStart: 'desc' }, take });
  return reports.map(toDailyReportRecord);
}
