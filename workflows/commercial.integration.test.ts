import { afterEach, describe, expect, test, vi } from 'vitest';
import { resumeHook, start } from 'workflow/api';

import { prisma } from '@/lib/db';
import { commercialLeadAnalysis } from './commercial';

describe('commercial workflow pause and resume', () => {
  afterEach(async () => {
    await prisma.agentOutbox.deleteMany();
    await prisma.agentAction.deleteMany();
    await prisma.agentRun.deleteMany();
    await prisma.lead.deleteMany({ where: { osmId: { startsWith: 'commercial-workflow-test:' } } });
  });

  test('persists a review suggestion, waits for approval, then resumes and records the decision', async () => {
    const lead = await prisma.lead.create({ data: {
      osmId: 'commercial-workflow-test:resume', name: 'Empresa para análise', phone: '+5511999990000', stage: 'CONTACTED'
    } });
    const runRecord = await prisma.agentRun.create({ data: {
      idempotencyKey: `commercial-workflow-test:${lead.id}`, leadId: lead.id, createdById: 'workflow-test-user',
      status: 'QUEUED', policyVersion: 'commercial-analysis-v1', leadVersion: lead.version,
      inputSnapshot: {
        id: lead.id, version: lead.version, name: lead.name, stage: lead.stage, phone: lead.phone,
        whatsapp: lead.whatsapp, website: lead.website, instagram: lead.instagram, address: lead.address, category: lead.category
      }
    } });

    const workflowRun = await start(commercialLeadAnalysis, [runRecord.id]);
    await vi.waitFor(async () => {
      const run = await prisma.agentRun.findUnique({ where: { id: runRecord.id } });
      expect(run?.status).toBe('NEEDS_APPROVAL');
    }, { timeout: 20_000, interval: 100 });

    const action = await prisma.agentAction.findFirstOrThrow({ where: { runId: runRecord.id } });
    await prisma.agentAction.update({ where: { id: action.id }, data: { status: 'REJECTED', rejectedAt: new Date() } });
    await resumeHook(action.approvalToken, { decision: 'REJECT', approvalHash: action.approvalHash });

    await expect(workflowRun.returnValue).resolves.toMatchObject({ status: 'COMPLETED' });
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: runRecord.id } })).status).toBe('COMPLETED');
    expect((await prisma.agentAction.findUniqueOrThrow({ where: { id: action.id } })).status).toBe('REJECTED');
  });
});
