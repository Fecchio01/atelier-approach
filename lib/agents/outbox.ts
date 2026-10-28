import { resumeHook } from 'workflow/api';

import { prisma } from '@/lib/db';

type DecisionPayload = { token: string; decision: 'APPROVE' | 'REJECT'; approvalHash: string };

export async function deliverAgentOutbox(limit = 20) {
  const pending = await prisma.agentOutbox.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: Math.min(Math.max(limit, 1), 50),
    include: { action: true }
  });
  let delivered = 0;

  for (const item of pending) {
    const payload = item.payload as unknown as DecisionPayload;
    try {
      await resumeHook(payload.token, { decision: payload.decision, approvalHash: payload.approvalHash });
      await prisma.agentOutbox.updateMany({
        where: { id: item.id, status: 'PENDING' },
        data: { status: 'DELIVERED', deliveredAt: new Date(), attempts: { increment: 1 }, lastError: null }
      });
      delivered += 1;
    } catch (error) {
      await prisma.agentOutbox.updateMany({
        where: { id: item.id, status: 'PENDING' },
        data: {
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message.slice(0, 500) : 'Falha ao retomar execução.'
        }
      });
    }
  }

  return { checked: pending.length, delivered };
}
