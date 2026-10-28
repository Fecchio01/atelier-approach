import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  startWorkflow: vi.fn(async () => ({ runId: 'workflow-run-test' })),
  deliverOutbox: vi.fn(async () => ({ checked: 0, delivered: 0 }))
}));

vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('../../lib/agents/runtime', () => ({ startCommercialLeadAnalysis: mocks.startWorkflow }));
vi.mock('../../lib/agents/outbox', () => ({ deliverAgentOutbox: mocks.deliverOutbox }));

import { POST as createRun } from '../../app/api/agents/runs/route';
import { POST as decideAction } from '../../app/api/agents/actions/[id]/decision/route';
import { prisma } from '../../lib/db';

describe('agent routes', () => {
  beforeEach(async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'agent-route-user', name: 'Equipe' });
    mocks.startWorkflow.mockClear();
    mocks.deliverOutbox.mockClear();
    await prisma.agentOutbox.deleteMany();
    await prisma.agentAction.deleteMany();
    await prisma.agentRun.deleteMany();
    await prisma.crmTask.deleteMany({ where: { createdById: 'agent-route-user' } });
    await prisma.activity.deleteMany({ where: { actorId: 'agent-route-user' } });
    await prisma.lead.deleteMany({ where: { osmId: { startsWith: 'agent-route-test:' } } });
  });

  afterEach(() => vi.clearAllMocks());

  test('repeated trigger for the same lead version reuses one logical run', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'agent-route-test:dedupe', name: 'Lead de teste' } });
    const request = () => new Request('http://localhost/api/agents/runs', { method: 'POST', body: JSON.stringify({ leadId: lead.id }) });

    const first = await createRun(request());
    const second = await createRun(request());
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(firstBody.runId).toBe(secondBody.runId);
    expect(firstBody.reused).toBe(false);
    expect(secondBody.reused).toBe(true);
    expect(mocks.startWorkflow).toHaveBeenCalledTimes(1);
    expect(await prisma.agentRun.count({ where: { leadId: lead.id } })).toBe(1);
  });

  test('double approval creates exactly one CRM task and increments the lead version once', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'agent-route-test:approval', name: 'Lead aprovado' } });
    const run = await prisma.agentRun.create({ data: {
      idempotencyKey: `${lead.id}:${lead.version}:test`, leadId: lead.id, createdById: 'agent-route-user',
      status: 'NEEDS_APPROVAL', policyVersion: 'test', leadVersion: lead.version, inputSnapshot: { id: lead.id }
    } });
    const action = await prisma.agentAction.create({ data: {
      runId: run.id, leadId: lead.id, approvalToken: `agent-route-test:${run.id}`, approvalHash: 'a'.repeat(64),
      leadVersion: lead.version, title: 'Revisar contato', description: 'Confira os dados antes de contactar.',
      taskType: 'OTHER', priority: 'NORMAL', dueDate: new Date('2026-10-28T12:00:00.000Z')
    } });
    const request = () => new Request(`http://localhost/api/agents/actions/${action.id}/decision`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'APPROVE', approvalHash: action.approvalHash })
    });

    const first = await decideAction(request(), { params: Promise.resolve({ id: action.id }) });
    const second = await decideAction(request(), { params: Promise.resolve({ id: action.id }) });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await second.json()).idempotent).toBe(true);
    expect(await prisma.crmTask.count({ where: { leadId: lead.id } })).toBe(1);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).version).toBe(lead.version + 1);
    expect((await prisma.agentAction.findUniqueOrThrow({ where: { id: action.id } })).status).toBe('APPLIED');
    expect(mocks.deliverOutbox).toHaveBeenCalledTimes(2);
  });

  test('a changed lead becomes stale and is not approved', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'agent-route-test:stale', name: 'Lead alterado' } });
    const run = await prisma.agentRun.create({ data: {
      idempotencyKey: `${lead.id}:${lead.version}:stale`, leadId: lead.id, createdById: 'agent-route-user',
      status: 'NEEDS_APPROVAL', policyVersion: 'test', leadVersion: lead.version, inputSnapshot: { id: lead.id }
    } });
    const action = await prisma.agentAction.create({ data: {
      runId: run.id, leadId: lead.id, approvalToken: `agent-route-test:${run.id}`, approvalHash: 'b'.repeat(64),
      leadVersion: lead.version, title: 'Revisar contato', description: 'Confira os dados.', taskType: 'OTHER', priority: 'NORMAL',
      dueDate: new Date('2026-10-28T12:00:00.000Z')
    } });
    await prisma.lead.update({ where: { id: lead.id }, data: { version: { increment: 1 } } });

    const response = await decideAction(new Request(`http://localhost/api/agents/actions/${action.id}/decision`, {
      method: 'POST', body: JSON.stringify({ decision: 'APPROVE', approvalHash: action.approvalHash })
    }), { params: Promise.resolve({ id: action.id }) });

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('STALE');
    expect(await prisma.crmTask.count({ where: { leadId: lead.id } })).toBe(0);
  });

  test('editing a suggestion changes its approval hash before it can be accepted', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'agent-route-test:edit', name: 'Lead editável' } });
    const run = await prisma.agentRun.create({ data: {
      idempotencyKey: `${lead.id}:${lead.version}:edit`, leadId: lead.id, createdById: 'agent-route-user',
      status: 'NEEDS_APPROVAL', policyVersion: 'test', leadVersion: lead.version, inputSnapshot: { id: lead.id }
    } });
    const dueDate = new Date('2026-10-28T12:00:00.000Z');
    const action = await prisma.agentAction.create({ data: {
      runId: run.id, leadId: lead.id, approvalToken: `agent-route-test:${run.id}`, approvalHash: 'c'.repeat(64),
      leadVersion: lead.version, title: 'Revisar contato', description: 'Confira os dados.', taskType: 'OTHER', priority: 'NORMAL', dueDate
    } });

    const edit = await decideAction(new Request(`http://localhost/api/agents/actions/${action.id}/decision`, {
      method: 'POST', body: JSON.stringify({ decision: 'EDIT', approvalHash: action.approvalHash, edits: { title: 'Confirmar canal da empresa' } })
    }), { params: Promise.resolve({ id: action.id }) });
    const edited = await edit.json();
    expect(edit.status).toBe(200);
    expect(edited.approvalHash).not.toBe(action.approvalHash);

    const staleApproval = await decideAction(new Request(`http://localhost/api/agents/actions/${action.id}/decision`, {
      method: 'POST', body: JSON.stringify({ decision: 'APPROVE', approvalHash: action.approvalHash })
    }), { params: Promise.resolve({ id: action.id }) });
    expect(staleApproval.status).toBe(409);
    expect(await prisma.crmTask.count({ where: { leadId: lead.id } })).toBe(0);

    const approved = await decideAction(new Request(`http://localhost/api/agents/actions/${action.id}/decision`, {
      method: 'POST', body: JSON.stringify({ decision: 'APPROVE', approvalHash: edited.approvalHash })
    }), { params: Promise.resolve({ id: action.id }) });
    expect(approved.status).toBe(200);
    expect(await prisma.crmTask.count({ where: { leadId: lead.id, title: 'Confirmar canal da empresa' } })).toBe(1);
  });
});
