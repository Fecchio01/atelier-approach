import { describe, expect, test } from 'vitest';

import { createAgentCrmActor, createHumanCrmActor, createSystemCrmActor } from '../../lib/crm/actor';
import { executeCrmCommand, withCrmActivityActor, type CrmCommandExecutor } from '../../lib/crm/commands';

describe('shared CRM command context', () => {
  test('classifies human, agent, and system actors without accepting empty identifiers', () => {
    expect(createHumanCrmActor(' member-1 ')).toEqual({ id: 'member-1', origin: 'HUMAN' });
    expect(createAgentCrmActor('qualification')).toEqual({ id: 'agent:qualification', origin: 'AGENT' });
    expect(createSystemCrmActor()).toEqual({ id: '__team__', origin: 'SYSTEM' });
    expect(() => createHumanCrmActor('  ')).toThrow(RangeError);
  });

  test('stamps activity with server-side actor provenance', () => {
    expect(withCrmActivityActor(createHumanCrmActor('member-1'), {
      leadId: 'lead-1', type: 'CONTACT', note: 'Contato confirmado.'
    })).toEqual({
      leadId: 'lead-1', type: 'CONTACT', note: 'Contato confirmado.', actorId: 'member-1', origin: 'HUMAN'
    });
  });

  test('executes a command within exactly one shared transaction', async () => {
    const transaction = { marker: 'same-transaction' };
    let transactionCount = 0;
    const database = {
      $transaction: async <T>(callback: (tx: typeof transaction) => Promise<T>) => {
        transactionCount += 1;
        return callback(transaction);
      }
    } as unknown as CrmCommandExecutor;
    const actor = createHumanCrmActor('member-1');

    const result = await executeCrmCommand(database, actor, async (tx, commandActor) => ({
      transactionMarker: (tx as unknown as typeof transaction).marker,
      actorId: commandActor.id
    }));

    expect(result).toEqual({ transactionMarker: 'same-transaction', actorId: 'member-1' });
    expect(transactionCount).toBe(1);
  });
});
