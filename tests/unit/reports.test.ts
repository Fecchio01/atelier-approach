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
      revenue: { sales: 1200, mrr: 297 },
      channels: [], funnel: [], members: [], followUps: { pending: 2, completed: 0, cancelled: 0, overdue: 1 }, notes: { total: 1, recent: ['Retornar amanhã.'] },
      period: { from: new Date('2026-09-07T00:00:00.000Z'), to: new Date('2026-09-14T00:00:00.000Z') }
    };

    expect(buildRecommendations(report)).toContainEqual(expect.objectContaining({
      metric: 'followUpsOverdue', direction: 'reduce', message: '1 follow-up está atrasado.'
    }));
  });

  test('returns a selected report range through the authenticated API', async () => {
    const response = await GET(new Request('http://localhost/api/reports?from=2026-09-07&to=2026-09-14'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ report: { period: { from: '2026-09-07T00:00:00.000Z', to: '2026-09-14T00:00:00.000Z' } } });
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
