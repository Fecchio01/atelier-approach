import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('../../components/daily-close-control', () => ({ DailyCloseControl: () => null }));
vi.mock('../../components/report-pdf-download', () => ({ ReportPdfDownload: () => null }));
vi.mock('../../components/report-period-navigation', () => ({ ReportPeriodNavigation: () => null }));

import { prisma } from '../../lib/db';
import * as reportModule from '../../lib/reports';
import type { DailyReportSnapshot } from '../../lib/reports';
import { closeCurrentDailyReport, getDailyReportForDate, listRecentDailyReports, reopenCurrentDailyReport } from '../../lib/daily-reports';
import * as reportRouteModule from '../../app/api/reports/route';
import * as reportPdfModule from '../../lib/report-pdf';
import { DailyReportView } from '../../components/daily-report-view';
import * as dailyReportsModule from '../../lib/daily-reports';

type DailySnapshot = DailyReportSnapshot;

type DailyReportBuilder = (input: { from: Date; to: Date; closedAt: Date }) => Promise<DailySnapshot>;
type CloseResponse = { report: { closedAt: string; snapshot: DailySnapshot }; created: boolean };
type ClosePost = (request: Request) => Promise<Response>;
type ReopenDelete = () => Promise<Response>;

const builder = (reportModule as unknown as Record<string, unknown>).buildDailyReportSnapshot as DailyReportBuilder | undefined;
const post = (reportRouteModule as unknown as Record<string, unknown>).POST as ClosePost | undefined;
const deleteReport = (reportRouteModule as unknown as Record<string, unknown>).DELETE as ReopenDelete | undefined;
const originalPrismaTransaction = prisma.$transaction;

describe('daily report snapshots', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Object.defineProperty(prisma, '$transaction', { configurable: true, writable: true, value: originalPrismaTransaction });
  });

  beforeEach(async () => {
    mocks.getCurrentUser.mockReset();
    mocks.getCurrentUser.mockResolvedValue({ id: 'daily-report-member' });
    await prisma.activity.deleteMany();
    await prisma.followUp.deleteMany();
    await prisma.saleEvent.deleteMany();
    await prisma.stageHistory.deleteMany();
    await prisma.lead.deleteMany();

    const dailyReportDb = prisma as unknown as { dailyReport?: { deleteMany: () => Promise<unknown> } };
    await dailyReportDb.dailyReport?.deleteMany();
  });

  test('requires authentication before closing the day', async () => {
    expect(post).toBeTypeOf('function');
    if (!post) return;

    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await post(new Request('http://localhost/api/reports', { method: 'POST' }));

    expect(response.status).toBe(401);
  });

  test('requires authentication before reopening the day', async () => {
    expect(deleteReport).toBeTypeOf('function');
    if (!deleteReport) return;

    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await deleteReport();

    expect(response.status).toBe(401);
  });

  test('reopens only today’s saved report and preserves CRM activities and prior reports', async () => {
    const reference = new Date('2026-09-29T13:00:00.000Z');
    const todayStart = new Date('2026-09-29T03:00:00.000Z');
    const yesterdayStart = new Date('2026-09-28T03:00:00.000Z');
    const lead = await prisma.lead.create({ data: { osmId: 'daily-reopen-preserves-activity', name: 'Oficina Mantida' } });
    await prisma.activity.create({ data: { leadId: lead.id, actorId: 'daily-report-member', note: 'Registro preservado.' } });
    await prisma.dailyReport.createMany({ data: [
      { id: 'daily-reopen-today', dayStart: todayStart, dayEnd: new Date('2026-09-30T03:00:00.000Z'), closedAt: reference, closedById: 'daily-report-member', snapshot: { summary: { approaches: 1 }, actions: [] } },
      { id: 'daily-reopen-yesterday', dayStart: yesterdayStart, dayEnd: todayStart, closedAt: new Date('2026-09-29T02:00:00.000Z'), closedById: 'daily-report-member', snapshot: { summary: { approaches: 7 }, actions: [] } }
    ] });

    await expect(reopenCurrentDailyReport(reference)).resolves.toBe(true);
    await expect(prisma.dailyReport.findUnique({ where: { dayStart: todayStart } })).resolves.toBeNull();
    await expect(prisma.dailyReport.findUnique({ where: { dayStart: yesterdayStart } })).resolves.toMatchObject({ id: 'daily-reopen-yesterday' });
    await expect(prisma.activity.count({ where: { leadId: lead.id } })).resolves.toBe(1);
  });

  test('returns recent report dates and approach counts without loading their full snapshots', async () => {
    const dayStart = new Date('2026-09-29T03:00:00.000Z');
    await prisma.dailyReport.create({
      data: {
        id: 'daily-recent-compact', dayStart, dayEnd: new Date('2026-09-30T03:00:00.000Z'),
        closedAt: new Date('2026-09-29T13:00:00.000Z'), closedById: 'daily-report-member',
        snapshot: { summary: { approaches: 4 }, actions: [{ id: 'large-action-payload', note: 'Snapshot detail should not be loaded into the archive list.' }] }
      }
    });

    await expect(listRecentDailyReports(1)).resolves.toEqual([{ id: 'daily-recent-compact', dayStart, approaches: 4 }]);
  });

  test('snapshots daily events through the close instant using São Paulo local boundaries', async () => {
    expect(builder).toBeTypeOf('function');
    if (!builder) return;

    const lead = await prisma.lead.create({ data: { osmId: 'daily-boundary', name: 'Oficina Horizonte' } });
    await prisma.activity.createMany({ data: [
      { leadId: lead.id, actorId: 'daily-report-member', type: 'CONTACT', channel: 'WHATSAPP', note: 'Antes da abertura local.', createdAt: new Date('2026-09-29T02:59:59.999Z') },
      { leadId: lead.id, actorId: 'daily-report-member', type: 'CONTACT', channel: 'WHATSAPP', note: 'No início do dia local.', createdAt: new Date('2026-09-29T03:00:00.000Z') },
      { leadId: lead.id, actorId: 'daily-report-member', type: 'CONTACT', channel: 'PHONE', note: 'No instante de fechar.', createdAt: new Date('2026-09-29T13:00:00.000Z') },
      { leadId: lead.id, actorId: 'daily-report-member', type: 'CONTACT', channel: 'EMAIL', note: 'Depois do fechamento.', createdAt: new Date('2026-09-29T13:00:00.001Z') }
    ] });
    await prisma.stageHistory.create({
      data: { leadId: lead.id, actorId: 'daily-report-member', toStage: 'QUALIFIED', createdAt: new Date('2026-09-29T12:00:00.000Z') }
    });
    await prisma.saleEvent.create({
      data: { leadId: lead.id, actorId: 'daily-report-member', saleValue: 1350, mrr: 120, occurredAt: new Date('2026-09-29T12:30:00.000Z') }
    });
    await prisma.followUp.create({
      data: {
        leadId: lead.id, ownerId: 'daily-report-member', dueDate: new Date('2026-09-29T13:00:00.000Z'), note: 'Retorno concluído.',
        state: 'COMPLETED', createdAt: new Date('2026-09-29T12:10:00.000Z'), completedAt: new Date('2026-09-29T12:15:00.000Z'), completedById: 'daily-report-member'
      }
    });
    await prisma.activity.create({
      data: { leadId: lead.id, actorId: 'daily-report-member', type: 'FOLLOW_UP_COMPLETED', note: 'Follow-up concluído.', createdAt: new Date('2026-09-29T12:15:00.000Z') }
    });

    const snapshot = await builder({
      from: new Date('2026-09-29T03:00:00.000Z'),
      to: new Date('2026-09-30T03:00:00.000Z'),
      closedAt: new Date('2026-09-29T13:00:00.000Z')
    });

    expect(snapshot.summary).toMatchObject({ approaches: 2, interests: 1, meetings: 0, sales: 1, revenue: 1350, mrr: 120, followUpsCompleted: 1 });
    expect(snapshot.actions).toHaveLength(3);
    expect(snapshot.actions[0]).toMatchObject({ leadName: 'Oficina Horizonte', occurredAt: '2026-09-29T03:00:00.000Z' });
    expect(snapshot.actions.at(-1)).toMatchObject({ occurredAt: '2026-09-29T13:00:00.000Z' });
  });

  test('reads all daily data from one repeatable-read database snapshot', async () => {
    expect(builder).toBeTypeOf('function');
    if (!builder) return;
    const transactionSpy = vi.spyOn(prisma, '$transaction').mockImplementation((async (...args: unknown[]) => {
      const [callback] = args as [(tx: typeof prisma) => Promise<unknown>];
      return callback(prisma);
    }) as typeof prisma.$transaction);

    await builder({
      from: new Date('2026-09-29T03:00:00.000Z'),
      to: new Date('2026-09-30T03:00:00.000Z'),
      closedAt: new Date('2026-09-29T13:00:00.000Z')
    });

    expect(transactionSpy).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
  });

  test('includes legacy wins per lead when other sales already have SaleEvent rows', async () => {
    expect(builder).toBeTypeOf('function');
    if (!builder) return;
    const legacyLead = await prisma.lead.create({
      data: {
        osmId: 'daily-legacy-win', name: 'Oficina Legada', stage: 'WON',
        saleValue: 400, mrr: 40, wonAt: new Date('2026-09-29T12:00:00.000Z'), wonById: 'legacy-member'
      }
    });
    const eventLead = await prisma.lead.create({
      data: {
        osmId: 'daily-event-win', name: 'Oficina Atual', stage: 'WON',
        saleValue: 600, mrr: 60, wonAt: new Date('2026-09-29T12:30:00.000Z'), wonById: 'event-member'
      }
    });
    await prisma.saleEvent.create({
      data: {
        leadId: eventLead.id, actorId: 'event-member', saleValue: 600, mrr: 60,
        occurredAt: new Date('2026-09-29T12:30:00.000Z')
      }
    });

    const snapshot = await builder({
      from: new Date('2026-09-29T03:00:00.000Z'),
      to: new Date('2026-09-30T03:00:00.000Z'),
      closedAt: new Date('2026-09-29T13:00:00.000Z')
    });

    expect(snapshot.summary).toMatchObject({ sales: 2, revenue: 1000, mrr: 100 });
    expect(snapshot.summary.members).toEqual(expect.arrayContaining([
      expect.objectContaining({ memberId: 'legacy-member', wins: 1, revenue: 400, mrr: 40 }),
      expect.objectContaining({ memberId: 'event-member', wins: 1, revenue: 600, mrr: 60 })
    ]));
  });

  test('an open-day snapshot excludes a reversed sale but keeps its action, without mutating a saved snapshot', async () => {
    expect(builder).toBeTypeOf('function');
    if (!builder) return;

    const from = new Date('2026-09-29T03:00:00.000Z');
    const to = new Date('2026-09-30T03:00:00.000Z');
    const firstClose = new Date('2026-09-29T13:00:00.000Z');
    const lead = await prisma.lead.create({ data: {
      osmId: 'daily-reversed-sale', name: 'Oficina Reaberta', stage: 'WON', saleValue: 500, mrr: 50,
      wonAt: new Date('2026-09-29T12:30:00.000Z'), wonById: 'daily-report-member'
    } });
    const sale = await prisma.saleEvent.create({ data: {
      leadId: lead.id, actorId: 'daily-report-member', saleValue: 500, mrr: 50, occurredAt: new Date('2026-09-29T12:30:00.000Z')
    } });
    const closed = await closeCurrentDailyReport('daily-report-member', firstClose);
    expect(closed.report.snapshot.summary).toMatchObject({ sales: 1, revenue: 500, mrr: 50 });

    await prisma.saleEvent.update({ where: { id: sale.id }, data: { reversedAt: new Date('2026-09-29T13:30:00.000Z'), reversedById: 'daily-report-member' } });
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: 'CONTACTED', saleValue: null, mrr: null, wonAt: null, wonById: null } });
    await prisma.activity.create({ data: {
      leadId: lead.id, actorId: 'daily-report-member', type: 'SALE_REVERSED', note: 'Venda revertida.', createdAt: new Date('2026-09-29T13:30:00.000Z')
    } });

    const openSnapshot = await builder({ from, to, closedAt: new Date('2026-09-29T14:00:00.000Z') });
    expect(openSnapshot.summary).toMatchObject({ sales: 0, revenue: 0, mrr: 0 });
    expect(openSnapshot.actions).toContainEqual(expect.objectContaining({ type: 'SALE_REVERSED', note: 'Venda revertida.' }));

    const unchanged = await getDailyReportForDate(firstClose);
    expect(unchanged?.snapshot).toEqual(closed.report.snapshot);

    const reportWithReversal = { ...unchanged!, snapshot: openSnapshot };
    vi.stubGlobal('React', React);
    const html = renderToStaticMarkup(React.createElement(DailyReportView, {
      date: '2026-09-29', report: reportWithReversal, recent: [], todayReport: true, todayHref: '/relatorios?period=day&date=2026-09-29'
    }));
    expect(html).toContain('Venda revertida');

    const createPdf = vi.spyOn(reportPdfModule, 'createReportPdf').mockResolvedValue(new Uint8Array([1]));
    vi.spyOn(dailyReportsModule, 'getDailyReportForDate').mockResolvedValue(reportWithReversal);
    const pdfResponse = await reportRouteModule.GET(new Request('http://localhost/api/reports?format=pdf&period=day&date=2026-09-29'));
    expect(pdfResponse.status).toBe(200);
    expect(createPdf.mock.calls.at(-1)?.[0].sections).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Ações do dia', lines: expect.arrayContaining([expect.stringContaining('Venda revertida')]) })
    ]));
  });

  test('returns the original snapshot on retry and leaves weekly activity live', async () => {
    expect(post).toBeTypeOf('function');
    if (!post) return;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-29T13:00:00.000Z'));

    const lead = await prisma.lead.create({ data: { osmId: 'daily-immutable', name: 'Detailing do Bosque' } });
    const firstResponse = await post(new Request('http://localhost/api/reports', { method: 'POST' }));
    expect(firstResponse.status).toBe(200);
    const first = await firstResponse.json() as CloseResponse;
    expect(first.created).toBe(true);
    expect(first.report.closedAt).toBe('2026-09-29T13:00:00.000Z');
    expect(first.report.snapshot.summary.approaches).toBe(0);

    const lateCreatedAt = new Date(new Date(first.report.closedAt).getTime() + 60_000);
    await prisma.activity.create({
      data: { leadId: lead.id, actorId: 'daily-report-member', type: 'CONTACT', channel: 'WHATSAPP', note: 'Registrada depois do fechamento.', createdAt: lateCreatedAt }
    });

    vi.setSystemTime(new Date('2026-09-29T13:02:00.000Z'));
    const retryResponse = await post(new Request('http://localhost/api/reports', { method: 'POST' }));
    expect(retryResponse.status).toBe(200);
    const retry = await retryResponse.json() as CloseResponse;
    expect(retry.created).toBe(false);
    expect(retry.report.snapshot).toEqual(first.report.snapshot);

    const liveReport = await reportModule.buildReport({
      from: new Date('2026-09-28T03:00:00.000Z'),
      to: new Date('2026-10-05T03:00:00.000Z')
    });
    expect(liveReport.goalActuals.approaches).toBe(1);
  });

  test('returns zero totals for an empty day and a fallback for a lead without a name', async () => {
    expect(builder).toBeTypeOf('function');
    if (!builder) return;

    const empty = await builder({
      from: new Date('2026-09-27T03:00:00.000Z'),
      to: new Date('2026-09-28T03:00:00.000Z'),
      closedAt: new Date('2026-09-28T02:59:59.999Z')
    });
    expect(empty.summary).toMatchObject({ approaches: 0, interests: 0, meetings: 0, sales: 0, revenue: 0, mrr: 0, followUpsCompleted: 0 });
    expect(empty.actions).toEqual([]);

    const lead = await prisma.lead.create({ data: { osmId: 'daily-fallback-name' } });
    await prisma.activity.create({
      data: { leadId: lead.id, actorId: 'missing-daily-member', type: 'CONTACT', channel: 'PHONE', note: 'Contato sem perfil.', createdAt: new Date('2026-09-29T04:00:00.000Z') }
    });
    const namedFallback = await builder({
      from: new Date('2026-09-29T03:00:00.000Z'),
      to: new Date('2026-09-30T03:00:00.000Z'),
      closedAt: new Date('2026-09-29T05:00:00.000Z')
    });

    expect(namedFallback.actions[0]).toMatchObject({ leadName: 'Empresa sem nome', actorName: null });
  });
});
