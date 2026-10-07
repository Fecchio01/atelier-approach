import { describe, expect, it } from 'vitest';

import { getCrmBoardLeads } from '../../lib/crm-board';

describe('CRM board query', () => {
  it('loads only the latest activity needed by each card, not full histories or follow-ups', async () => {
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
        activities: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });
    expect(query).not.toHaveProperty('include.activities');
    expect(query).not.toHaveProperty('select.followUps');
  });
});
