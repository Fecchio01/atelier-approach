import { describe, expect, it } from 'vitest';

import { getCrmBoardLeads } from '../../lib/crm-board';

describe('CRM board query', () => {
  it('loads lifecycle timestamps, latest activity, and only the pending follow-up origin', async () => {
    let query: unknown;
    const database = {
      lead: {
        findMany: async (input: unknown) => {
          query = input;
          return [];
        }
      }
    } as unknown as Parameters<typeof getCrmBoardLeads>[0];

    await getCrmBoardLeads(database);

    expect(query).toMatchObject({
      orderBy: { id: 'desc' },
      select: {
        id: true,
        stage: true,
        stageEnteredAt: true,
        postFollowUpAt: true,
        discardedAt: true,
        activities: { orderBy: { createdAt: 'desc' }, take: 1 },
        followUps: {
          where: { state: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { returnStage: true, dueDate: true }
        }
      }
    });
    expect(query).not.toHaveProperty('include.activities');
    expect(query).not.toHaveProperty('select.followUps.include');
  });

  it('projects the pending follow-up origin as a first-class board field', async () => {
    const database = {
      lead: {
        findMany: async () => [{
          id: 'lead-1',
          stage: 'FOLLOW_UP',
          stageEnteredAt: new Date('2026-10-01T00:00:00Z'),
          meetingAt: null,
          postFollowUpAt: null,
          discardedAt: null,
          activities: [],
          followUps: [{ returnStage: 'INTEREST', dueDate: new Date('2026-10-25T12:00:00Z') }]
        }]
      }
    } as unknown as Parameters<typeof getCrmBoardLeads>[0];

    await expect(getCrmBoardLeads(database)).resolves.toMatchObject([
      { id: 'lead-1', followUpOriginStage: 'INTEREST', nextActionAt: new Date('2026-10-25T12:00:00Z') }
    ]);
  });

  it('uses a meeting or post-return deadline when no follow-up is scheduled', async () => {
    const database = {
      lead: {
        findMany: async () => [
          {
            id: 'meeting', stage: 'MEETING', stageEnteredAt: new Date('2026-10-01T00:00:00Z'),
            meetingAt: new Date('2026-10-28T15:00:00Z'), postFollowUpAt: null, discardedAt: null,
            activities: [], followUps: []
          },
          {
            id: 'post-return', stage: 'IN_CONVERSATION', stageEnteredAt: new Date('2026-10-01T00:00:00Z'),
            meetingAt: null, postFollowUpAt: new Date('2026-10-24T12:00:00Z'), discardedAt: null,
            activities: [], followUps: []
          }
        ]
      }
    } as unknown as Parameters<typeof getCrmBoardLeads>[0];

    await expect(getCrmBoardLeads(database)).resolves.toMatchObject([
      { id: 'meeting', nextActionAt: new Date('2026-10-28T15:00:00Z') },
      { id: 'post-return', nextActionAt: new Date('2026-10-24T12:00:00Z') }
    ]);
  });

  it('does not treat an old meeting date as the next action after the lead leaves the meeting stage', async () => {
    const database = {
      lead: {
        findMany: async () => [{
          id: 'past-meeting', stage: 'IN_CONVERSATION', stageEnteredAt: new Date('2026-10-20T00:00:00Z'),
          meetingAt: new Date('2026-10-18T15:00:00Z'), postFollowUpAt: null, discardedAt: null,
          activities: [], followUps: []
        }]
      }
    } as unknown as Parameters<typeof getCrmBoardLeads>[0];

    await expect(getCrmBoardLeads(database)).resolves.toMatchObject([
      { id: 'past-meeting', nextActionAt: null }
    ]);
  });
});
