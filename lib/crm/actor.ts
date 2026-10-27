export type CrmActorOrigin = 'HUMAN' | 'AGENT' | 'SYSTEM';

export type CrmActor = Readonly<{
  id: string;
  origin: CrmActorOrigin;
}>;

export function createCrmActor(id: string, origin: CrmActorOrigin): CrmActor {
  const normalizedId = id.trim();
  if (!normalizedId || normalizedId.length > 128) {
    throw new RangeError('O identificador do autor do CRM deve ter entre 1 e 128 caracteres.');
  }
  return Object.freeze({ id: normalizedId, origin });
}

export function createHumanCrmActor(memberId: string): CrmActor {
  return createCrmActor(memberId, 'HUMAN');
}

export function createAgentCrmActor(agentId: string): CrmActor {
  const normalizedId = agentId.trim();
  if (!normalizedId || normalizedId.length > 121) {
    throw new RangeError('O identificador do agente do CRM deve ter entre 1 e 121 caracteres.');
  }
  return createCrmActor(`agent:${normalizedId}`, 'AGENT');
}

export function createSystemCrmActor(): CrmActor {
  return createCrmActor('__team__', 'SYSTEM');
}
