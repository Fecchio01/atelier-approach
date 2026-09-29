import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));

import { prisma } from '../../lib/db';
import * as reportModule from '../../lib/reports';
import * as reportRouteModule from '../../app/api/reports/route';

type DailySnapshot = {
  summary: {
    approaches: number;
    interests: number;
    meetings: number;
    sales: number;
    revenue: number;
    mrr: number;
    followUpsCompleted: number;
    members: Array<{ memberId: string; wins: number; revenue: number; mrr: number }>;
  };
  actions: Array<{
    type: string;
    leadName: string | null;
    actorName: string | null;
    occurredAt: Date | string;
  }>;
};

type DailyReportBuilder = (input: { from: Date; to: Date; closedAt: Date }) => Promise<DailySnapshot>;
type CloseResponse = { report: { closedAt: string; snapshot: DailySnapshot }; created: boolean };
type ClosePost = (request: Request) => Promise<Response>;

const builder = (reportModule as unknown as Record<string, unknown>).buildDailyReportSnapshot as DailyReportBuilder | undefined;
const post = (reportRouteModule as unknown as Record<string, unknown>).POST as ClosePost | undefined;

describe('daily report snapshots', () => {
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
      data: { leadId: lead.id, actorId: 'daily-report-member', toStage: 'INTEREST', createdAt: new Date('2026-09-29T12:00:00.000Z') }
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

  test('returns the original snapshot on retry and leaves weekly activity live', async () => {
    expect(post).toBeTypeOf('function');
    if (!post) return;

    const lead = await prisma.lead.create({ data: { osmId: 'daily-immutable', name: 'Detailing do Bosque' } });
    const firstResponse = await post(new Request('http://localhost/api/reports', { method: 'POST' }));
    expect(firstResponse.status).toBe(200);
    const first = await firstResponse.json() as CloseResponse;
    expect(first.created).toBe(true);

    const lateCreatedAt = new Date(new Date(first.report.closedAt).getTime() + 60_000);
    await prisma.activity.create({
      data: { leadId: lead.id, actorId: 'daily-report-member', type: 'CONTACT', channel: 'WHATSAPP', note: 'Registrada depois do fechamento.', createdAt: lateCreatedAt }
    });

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
