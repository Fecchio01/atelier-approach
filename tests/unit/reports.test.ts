import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));

import { buildRecommendations, buildReport, getRecentReportRange } from '../../lib/reports';
import { prisma } from '../../lib/db';
import { GET } from '../../app/api/reports/route';

describe('commercial reports', () => {
  beforeEach(async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'ana' });
    await prisma.activity.deleteMany();
    await prisma.followUp.deleteMany();
    await prisma.lead.deleteMany();
  });

  test('uses CRM records and win events to calculate channel conversion for the selected range', async () => {
    const converted = await prisma.lead.create({
      data: { osmId: 'report-converted', name: 'Oficina Um', stage: 'WON', saleValue: 1200, mrr: 297, wonAt: new Date('2026-09-10T10:00:00.000Z'), wonById: 'ana' }
    });
    const open = await prisma.lead.create({ data: { osmId: 'report-open', name: 'Oficina Dois', stage: 'INTEREST' } });
    const oldWin = await prisma.lead.create({
      data: { osmId: 'report-old-win', name: 'Oficina Três', stage: 'WON', saleValue: 900, mrr: 90, wonAt: new Date('2026-08-30T10:00:00.000Z'), wonById: 'ana' }
    });
    await prisma.activity.createMany({
      data: [
        { leadId: converted.id, actorId: 'ana', channel: 'WHATSAPP', note: 'Pediu proposta.', createdAt: new Date('2026-09-09T10:00:00.000Z') },
        { leadId: open.id, actorId: 'bia', channel: 'WHATSAPP', note: 'Aguardando retorno.', createdAt: new Date('2026-09-10T10:00:00.000Z') },
        { leadId: oldWin.id, actorId: 'ana', channel: 'PHONE', note: 'Contato de acompanhamento.', createdAt: new Date('2026-09-10T09:00:00.000Z') }
      ]
    });
    await prisma.followUp.create({ data: { leadId: open.id, ownerId: 'bia', dueDate: new Date('2026-09-11T09:00:00.000Z'), note: 'Retornar proposta.' } });

    const report = await buildReport({ from: new Date('2026-09-07T00:00:00.000Z'), to: new Date('2026-09-14T00:00:00.000Z'), now: new Date('2026-09-12T12:00:00.000Z') });

    expect(report.conversion).toEqual({ approaches: 3, wins: 1, rate: 0.33 });
    expect(report.revenue).toEqual({ sales: 1200, mrr: 297 });
    expect(report.channels).toContainEqual({ channel: 'WHATSAPP', approaches: 2, wins: 1, conversionRate: 0.5 });
    expect(report.channels).toContainEqual({ channel: 'PHONE', approaches: 1, wins: 0, conversionRate: 0 });
    expect(report.funnel).toContainEqual({ stage: 'WON', leads: 2 });
    expect(report.followUps).toEqual({ pending: 1, completed: 0, cancelled: 0, overdue: 1 });
    expect(report.members).toContainEqual({ memberId: 'ana', approaches: 2, interests: 0, meetings: 0, wins: 1, sales: 1200, mrr: 297 });
    expect(report.members).toContainEqual({ memberId: 'bia', approaches: 1, interests: 0, meetings: 0, wins: 0, sales: 0, mrr: 0 });
    expect(report.notes).toEqual({ total: 3, recent: ['Aguardando retorno.', 'Contato de acompanhamento.', 'Pediu proposta.'] });
  });

  test('recommends reducing overdue follow-ups from the measured report, without a predictive claim', () => {
    const report = {
      conversion: { approaches: 3, wins: 1, rate: 0.33 },
      goalActuals: { approaches: 3, interests: 0, meetings: 0, sales: 1, revenue: 1200, mrr: 297, followUpsCompleted: 0, conversionRate: 33 },
      revenue: { sales: 1200, mrr: 297 },
      channels: [], funnel: [], members: [], followUps: { pending: 2, completed: 0, cancelled: 0, overdue: 1 }, notes: { total: 1, recent: ['Retornar amanhã.'] },
      period: { from: new Date('2026-09-07T00:00:00.000Z'), to: new Date('2026-09-14T00:00:00.000Z') }
    };

    expect(buildRecommendations(report)).toContainEqual(expect.objectContaining({
      metric: 'followUpsOverdue', direction: 'reduce', message: '1 follow-up está atrasado.'
    }));
  });

  test('counts completed, cancelled, and pending follow-ups within the selected period', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'report-follow-up-states' } });
    await prisma.followUp.createMany({ data: [
      { leadId: lead.id, ownerId: 'ana', dueDate: new Date('2026-09-10T10:00:00.000Z'), state: 'COMPLETED', note: 'Concluído.', createdAt: new Date('2026-09-09T10:00:00.000Z'), completedAt: new Date('2026-09-10T11:00:00.000Z'), completedById: 'ana' },
      { leadId: lead.id, ownerId: 'ana', dueDate: new Date('2026-09-10T10:00:00.000Z'), state: 'CANCELLED', note: 'Cancelado.', createdAt: new Date('2026-09-09T10:00:00.000Z'), cancelledAt: new Date('2026-09-10T11:00:00.000Z'), cancelledById: 'ana' },
      { leadId: lead.id, ownerId: 'ana', dueDate: new Date('2026-09-20T10:00:00.000Z'), state: 'PENDING', note: 'Fora do período.', createdAt: new Date('2026-09-09T10:00:00.000Z') }
    ] });

    const report = await buildReport({ from: new Date('2026-09-07T00:00:00.000Z'), to: new Date('2026-09-14T00:00:00.000Z'), now: new Date('2026-09-12T12:00:00.000Z') });

    expect(report.followUps).toEqual({ pending: 0, completed: 1, cancelled: 1, overdue: 0 });
  });

  test('returns a selected report range through the authenticated API', async () => {
    const response = await GET(new Request('http://localhost/api/reports?from=2026-09-07&to=2026-09-14'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ report: { period: { from: '2026-09-07T00:00:00.000Z', to: '2026-09-14T00:00:00.000Z' } } });
  });

  test('resolves the current week to Monday through Sunday in São Paulo, not a rolling seven days', () => {
    expect(getRecentReportRange('week', new Date('2026-09-12T14:00:00.000Z'))).toEqual({
      from: new Date('2026-09-07T03:00:00.000Z'),
      to: new Date('2026-09-14T03:00:00.000Z')
    });
  });

  test('resolves a custom monthly cycle from the configured start day', () => {
    expect(getRecentReportRange('month', new Date('2026-06-14T02:59:59.999Z'), 14)).toEqual({
      from: new Date('2026-05-14T03:00:00.000Z'),
      to: new Date('2026-06-14T03:00:00.000Z')
    });
  });

  test('returns the eight actuals that the team goal compares with targets', async () => {
    const lead = await prisma.lead.create({
      data: {
        osmId: 'report-goal-actuals', stage: 'WON', saleValue: 1200, mrr: 297,
        wonAt: new Date('2026-09-10T10:00:00.000Z'), wonById: 'ana',
        activities: { create: { actorId: 'ana', type: 'CONTACT', channel: 'WHATSAPP', note: 'Primeira abordagem.', createdAt: new Date('2026-09-09T10:00:00.000Z') } },
        stageHistory: { create: [
          { actorId: 'ana', toStage: 'INTEREST', createdAt: new Date('2026-09-09T11:00:00.000Z') },
          { actorId: 'ana', toStage: 'FOLLOW_UP', createdAt: new Date('2026-09-09T12:00:00.000Z') }
        ] },
        followUps: { create: { ownerId: 'ana', dueDate: new Date('2026-09-10T10:00:00.000Z'), note: 'Retorno concluído.', state: 'COMPLETED', completedAt: new Date('2026-09-10T11:00:00.000Z'), completedById: 'ana' } }
      }
    });

    const report = await buildReport({ from: new Date('2026-09-07T03:00:00.000Z'), to: new Date('2026-09-14T03:00:00.000Z') });

    expect(lead.id).toBeTruthy();
    expect(report.goalActuals).toEqual({
      approaches: 1, interests: 1, meetings: 1, sales: 1,
      revenue: 1200, mrr: 297, followUpsCompleted: 1, conversionRate: 100
    });
  });

  test('includes activity and win events from the current day in the recent period', async () => {
    const now = new Date('2026-09-12T14:00:00.000Z');
    const lead = await prisma.lead.create({
      data: { osmId: 'report-today', stage: 'WON', saleValue: 500, wonAt: now, wonById: 'ana' }
    });
    await prisma.activity.create({ data: { leadId: lead.id, actorId: 'ana', channel: 'EMAIL', note: 'Ganho registrado hoje.', createdAt: now } });

    const report = await buildReport({ ...getRecentReportRange('week', now), now });

    expect(report.conversion).toEqual({ approaches: 1, wins: 1, rate: 1 });
    expect(report.revenue.sales).toBe(500);
  });
});
