import { describe, expect, test } from 'vitest';
import { processLeadLifecycle, type LifecycleDatabase } from '../../lib/process-lead-lifecycle';

type LeadFixture = {
  id: string;
  stage: string;
  stageEnteredAt: Date;
  postFollowUpAt: Date | null;
  discardedAt: Date | null;
};

function makeDatabase(seed: {
  leads?: LeadFixture[];
  actors?: Record<string, string | null>;
  pendingFollowUps?: string[];
} = {}) {
  const leads = seed.leads ?? [];
  const pending = new Set(seed.pendingFollowUps ?? []);
  const followUps: Record<string, unknown>[] = [];
  const cancelledFollowUps: Record<string, unknown>[] = [];
  const histories: Record<string, unknown>[] = [];
  const activities: Record<string, unknown>[] = [];
  const deleted: string[] = [];
  const db = {
    crmSettings: { findUnique: async () => ({ followUpDelayDays: 2 }) },
    lead: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const stageClause = where.stage as { in?: string[] } | undefined;
        const dueClause = where.stageEnteredAt as { lte?: Date } | undefined;
        const postClause = where.postFollowUpAt as { lte?: Date } | undefined;
        return leads.filter((lead) => {
          if (stageClause?.in && !stageClause.in.includes(lead.stage)) return false;
          if (dueClause?.lte && lead.stageEnteredAt > dueClause.lte) return false;
          if (Object.prototype.hasOwnProperty.call(where, 'postFollowUpAt') && where.postFollowUpAt === null && lead.postFollowUpAt !== null) return false;
          if (postClause?.lte && (!lead.postFollowUpAt || lead.postFollowUpAt > postClause.lte)) return false;
          return true;
        }).map((lead) => ({ ...lead }));
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<LeadFixture> }) => {
        const lead = leads.find((item) => item.id === where.id);
        if (!lead || lead.stage !== where.stage || lead.stageEnteredAt.getTime() !== (where.stageEnteredAt as Date).getTime() ||
          (lead.postFollowUpAt?.getTime() ?? null) !== ((where.postFollowUpAt as Date | null | undefined)?.getTime() ?? null)) return { count: 0 };
        Object.assign(lead, data);
        return { count: 1 };
      },
      deleteMany: async ({ where }: { where: { stage: string; discardedAt: { lte: Date } } }) => {
        const eligible = leads.filter((lead) => lead.stage === where.stage && lead.discardedAt !== null && lead.discardedAt <= where.discardedAt.lte);
        eligible.forEach((lead) => { deleted.push(lead.id); leads.splice(leads.indexOf(lead), 1); });
        return { count: eligible.length };
      }
    },
    followUp: {
      findFirst: async ({ where }: { where: { leadId: string; state: string } }) => pending.has(where.leadId) ? { id: 'existing' } : null,
      updateMany: async ({ where, data }: { where: { leadId: string; state: string }; data: Record<string, unknown> }) => {
        const wasPending = pending.delete(where.leadId);
        if (wasPending) cancelledFollowUps.push({ leadId: where.leadId, ...data });
        return { count: wasPending ? 1 : 0 };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => { followUps.push(data); return data; }
    },
    activity: {
      findFirst: async ({ where }: { where: { leadId: string } }) => ({ actorId: seed.actors?.[where.leadId] ?? null }),
      create: async ({ data }: { data: Record<string, unknown> }) => { activities.push(data); return data; }
    },
    stageHistory: { create: async ({ data }: { data: Record<string, unknown> }) => { histories.push(data); return data; } },
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => callback(db)
  };
  return { db: db as unknown as LifecycleDatabase, leads, followUps, cancelledFollowUps, histories, activities, deleted };
}

const at = (value: string) => new Date(value);
const now = at('2026-09-10T10:00:00.000Z');

describe('lead lifecycle processor without database', () => {
  test('moves a due active lead to follow-up with exact due time, origin, and latest actor', async () => {
    const fixture = makeDatabase({
      leads: [{ id: 'due', stage: 'PROPOSAL', stageEnteredAt: at('2026-09-08T10:00:00Z'), postFollowUpAt: null, discardedAt: null }],
      actors: { due: 'member-2' },
      pendingFollowUps: ['due']
    });

    await expect(processLeadLifecycle(fixture.db, now)).resolves.toEqual({ movedToFollowUp: 1, discardedForInactivity: 0, permanentlyDeleted: 0 });
    expect(fixture.leads[0]).toMatchObject({ stage: 'FOLLOW_UP', stageEnteredAt: now });
    expect(fixture.followUps[0]).toMatchObject({ leadId: 'due', dueDate: at('2026-09-10T10:00:00Z'), ownerId: 'member-2', returnStage: 'PROPOSAL' });
    expect(fixture.cancelledFollowUps).toEqual([expect.objectContaining({ leadId: 'due', state: 'CANCELLED', cancelledById: '__team__' })]);
    expect(fixture.histories).toHaveLength(1);
    expect(fixture.activities).toHaveLength(1);
  });

  test('does not auto-follow-up excluded stages and uses team owner for a missing activity actor', async () => {
    const fixture = makeDatabase({ leads: [
      { id: 'no-response', stage: 'NO_RESPONSE', stageEnteredAt: at('2026-09-01T10:00:00Z'), postFollowUpAt: null, discardedAt: null },
      { id: 'won', stage: 'WON', stageEnteredAt: at('2026-09-01T10:00:00Z'), postFollowUpAt: null, discardedAt: null },
      { id: 'discarded', stage: 'DISCARDED', stageEnteredAt: at('2026-09-01T10:00:00Z'), postFollowUpAt: null, discardedAt: now },
      { id: 'old', stage: 'CONTACTED', stageEnteredAt: at('2026-09-01T10:00:00Z'), postFollowUpAt: null, discardedAt: null }
    ] });

    const result = await processLeadLifecycle(fixture.db, now);
    expect(result.movedToFollowUp).toBe(1);
    expect(fixture.followUps[0]).toMatchObject({ leadId: 'old', ownerId: '__team__', returnStage: 'CONTACTED' });
    expect(fixture.leads.find(({ id }) => id === 'won')?.stage).toBe('WON');
    expect(fixture.leads.find(({ id }) => id === 'no-response')?.stage).toBe('NO_RESPONSE');
    expect(fixture.leads.find(({ id }) => id === 'discarded')?.stage).toBe('DISCARDED');
  });

  test('discards post-follow-up leads at the exact five-day boundary', async () => {
    const fixture = makeDatabase({ leads: [{ id: 'discard-due', stage: 'INTEREST', stageEnteredAt: at('2026-09-05T10:00:00Z'), postFollowUpAt: at('2026-09-05T10:00:00Z'), discardedAt: null }] });

    await expect(processLeadLifecycle(fixture.db, now)).resolves.toEqual({ movedToFollowUp: 0, discardedForInactivity: 1, permanentlyDeleted: 0 });
    expect(fixture.leads[0]).toMatchObject({ stage: 'DISCARDED', stageEnteredAt: now, discardedAt: now, postFollowUpAt: null });
    expect(fixture.histories[0]).toMatchObject({ fromStage: 'INTEREST', toStage: 'DISCARDED', actorId: '__team__' });
  });

  test('expires legacy FOLLOW_UP and NO_RESPONSE post-follow-up timers without auto-scheduling them', async () => {
    const fixture = makeDatabase({ leads: [
      { id: 'legacy-follow-up', stage: 'FOLLOW_UP', stageEnteredAt: at('2026-09-05T10:00:00Z'), postFollowUpAt: at('2026-09-05T10:00:00Z'), discardedAt: null },
      { id: 'no-response-after-follow-up', stage: 'NO_RESPONSE', stageEnteredAt: at('2026-09-05T10:00:00Z'), postFollowUpAt: at('2026-09-05T10:00:00Z'), discardedAt: null }
    ] });

    await expect(processLeadLifecycle(fixture.db, now)).resolves.toEqual({ movedToFollowUp: 0, discardedForInactivity: 2, permanentlyDeleted: 0 });
    expect(fixture.leads.map(({ stage }) => stage)).toEqual(['DISCARDED', 'DISCARDED']);
    expect(fixture.followUps).toHaveLength(0);
  });

  test('preserves null/young discarded dates and purges only at seven days', async () => {
    const fixture = makeDatabase({ leads: [
      { id: 'legacy-null', stage: 'DISCARDED', stageEnteredAt: at('2020-01-01T00:00:00Z'), postFollowUpAt: null, discardedAt: null },
      { id: 'young', stage: 'DISCARDED', stageEnteredAt: at('2026-09-04T10:00:01Z'), postFollowUpAt: null, discardedAt: at('2026-09-04T10:00:01Z') },
      { id: 'eligible', stage: 'DISCARDED', stageEnteredAt: at('2026-09-03T10:00:00Z'), postFollowUpAt: null, discardedAt: at('2026-09-03T10:00:00Z') }
    ] });

    await expect(processLeadLifecycle(fixture.db, now)).resolves.toEqual({ movedToFollowUp: 0, discardedForInactivity: 0, permanentlyDeleted: 1 });
    expect(fixture.deleted).toEqual(['eligible']);
    expect(fixture.leads.map(({ id }) => id)).toEqual(['legacy-null', 'young']);
  });

  test('a manual stage move between selection and guarded write prevents stale processing', async () => {
    const fixture = makeDatabase({ leads: [{ id: 'raced', stage: 'PROPOSAL', stageEnteredAt: at('2026-09-08T10:00:00Z'), postFollowUpAt: null, discardedAt: null }] });
    const originalFindMany = fixture.db.lead.findMany;
    fixture.db.lead.findMany = async (args) => {
      const candidates = await originalFindMany(args);
      fixture.leads[0].stage = 'MEETING';
      fixture.leads[0].stageEnteredAt = now;
      return candidates;
    };

    await expect(processLeadLifecycle(fixture.db, now)).resolves.toEqual({ movedToFollowUp: 0, discardedForInactivity: 0, permanentlyDeleted: 0 });
    expect(fixture.followUps).toHaveLength(0);
    expect(fixture.activities).toHaveLength(0);
    expect(fixture.leads[0]).toMatchObject({ stage: 'MEETING', stageEnteredAt: now });
  });

  test('repeated and concurrent runs create one follow-up and one transition activity', async () => {
    const fixture = makeDatabase({ leads: [{ id: 'once', stage: 'CONTACTED', stageEnteredAt: at('2026-09-08T10:00:00Z'), postFollowUpAt: null, discardedAt: null }] });

    const results = await Promise.all([
      processLeadLifecycle(fixture.db, now),
      processLeadLifecycle(fixture.db, now),
      processLeadLifecycle(fixture.db, now)
    ]);
    expect(results.reduce((total, result) => total + result.movedToFollowUp, 0)).toBe(1);
    expect(fixture.followUps).toHaveLength(1);
    expect(fixture.activities).toHaveLength(1);
    expect(fixture.histories).toHaveLength(1);
  });

  test('blocks automatic follow-up while the post-completion five-day timer is active', async () => {
    const fixture = makeDatabase({ leads: [{ id: 'cooldown', stage: 'CONTACTED', stageEnteredAt: at('2026-09-01T10:00:00Z'), postFollowUpAt: at('2026-09-09T10:00:00Z'), discardedAt: null }] });

    const result = await processLeadLifecycle(fixture.db, now);
    expect(result.movedToFollowUp).toBe(0);
    expect(fixture.followUps).toHaveLength(0);
    expect(fixture.leads[0].stage).toBe('CONTACTED');
  });
});
