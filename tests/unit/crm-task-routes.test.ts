import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  prisma: {
    crmTask: { findMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    followUp: { findMany: vi.fn() },
    memberProfile: { findMany: vi.fn(), findUnique: vi.fn() },
    lead: { findUnique: vi.fn() },
    activity: { create: vi.fn() },
    $transaction: vi.fn()
  }
}));

vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('../../lib/db', () => ({ prisma: mocks.prisma }));

import { GET, POST } from '../../app/api/crm/tasks/route';
import { PATCH } from '../../app/api/crm/tasks/[id]/route';

const dueDate = '2026-10-24T15:30:00.000Z';
const task = {
  id: 'task-1', leadId: 'lead-1', title: 'Enviar proposta', type: 'EMAIL', priority: 'HIGH', dueDate: new Date(dueDate),
  assigneeId: 'member-2', createdById: 'member-1', updatedById: 'member-1', state: 'PENDING',
  completedAt: null, completedById: null, cancelledAt: null, cancelledById: null,
  createdAt: new Date('2026-10-20T12:00:00.000Z'), updatedAt: new Date('2026-10-20T12:00:00.000Z'),
  lead: { id: 'lead-1', name: 'Oficina Central' }
};

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue({ id: 'member-1' });
  mocks.prisma.$transaction.mockImplementation(async (operation: unknown) => (operation as (tx: unknown) => Promise<unknown>)(mocks.prisma));
});

afterEach(() => vi.resetAllMocks());

describe('shared CRM task routes', () => {
  test('rejects unauthenticated queue reads and writes', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const read = await GET(new Request('http://localhost/api/crm/tasks'));
    const create = await POST(new Request('http://localhost/api/crm/tasks', { method: 'POST', body: '{}' }));

    expect(read.status).toBe(401);
    expect(create.status).toBe(401);
    expect(mocks.prisma.crmTask.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  test('lists shared tasks together with pending follow-ups and public member choices', async () => {
    mocks.prisma.crmTask.findMany.mockResolvedValue([{ ...task, lead: { id: 'lead-1', name: 'Oficina Central' } }]);
    mocks.prisma.followUp.findMany.mockResolvedValue([{
      id: 'follow-1', leadId: 'lead-2', dueDate: new Date('2026-10-23T11:00:00.000Z'), ownerId: 'member-2',
      note: 'Retornar ligação', state: 'PENDING', returnStage: 'QUALIFIED',
      lead: { id: 'lead-2', name: 'Clínica Solar' }
    }]);
    mocks.prisma.memberProfile.findMany.mockResolvedValue([
      { id: 'member-1', name: 'João', email: 'private@example.com', avatarUrl: '/private.png' },
      { id: 'member-2', name: 'Ana', email: 'ana@example.com', avatarUrl: null }
    ]);

    const response = await GET(new Request('http://localhost/api/crm/tasks'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'TASK', id: 'task-1', leadId: 'lead-1', leadName: 'Oficina Central', assigneeId: 'member-2', assigneeName: 'Ana' }),
      expect.objectContaining({ kind: 'FOLLOW_UP', id: 'follow-1', leadId: 'lead-2', title: 'Retornar ligação', assigneeId: 'member-2', assigneeName: 'Ana', returnStage: 'QUALIFIED' })
    ]));
    expect(payload.members).toEqual([{ id: 'member-1', name: 'João' }, { id: 'member-2', name: 'Ana' }]);
    expect(JSON.stringify(payload)).not.toMatch(/private@example|ana@example|private\.png/);
  });

  test('creates task and audit activity transactionally using the authenticated creator', async () => {
    mocks.prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' });
    mocks.prisma.memberProfile.findUnique.mockResolvedValue({ id: 'member-2' });
    mocks.prisma.crmTask.create.mockResolvedValue(task);

    const response = await POST(new Request('http://localhost/api/crm/tasks', {
      method: 'POST', body: JSON.stringify({ leadId: 'lead-1', title: 'Enviar proposta', type: 'EMAIL', priority: 'HIGH', dueDate, assigneeId: 'member-2', createdById: 'spoofed' })
    }));

    expect(response.status).toBe(201);
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.prisma.crmTask.create).toHaveBeenCalledWith({ data: expect.objectContaining({ createdById: 'member-1', updatedById: 'member-1', leadId: 'lead-1', assigneeId: 'member-2' }) });
    expect(mocks.prisma.activity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ leadId: 'lead-1', actorId: 'member-1', type: 'CRM_TASK_CREATED' }) });
  });

  test.each([
    ['company', { leadId: 'missing-lead', title: 'Enviar proposta', type: 'EMAIL', priority: 'NORMAL', dueDate, assigneeId: 'member-2' }],
    ['assignee', { leadId: 'lead-1', title: 'Enviar proposta', type: 'EMAIL', priority: 'NORMAL', dueDate, assigneeId: 'missing-member' }]
  ])('rejects a task with an unknown %s without partial writes', async (reference, body) => {
    mocks.prisma.lead.findUnique.mockResolvedValue(reference === 'company' ? null : { id: 'lead-1' });
    mocks.prisma.memberProfile.findUnique.mockResolvedValue(reference === 'assignee' ? null : { id: 'member-2' });

    const response = await POST(new Request('http://localhost/api/crm/tasks', { method: 'POST', body: JSON.stringify(body) }));

    expect(response.status).toBe(404);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.crmTask.create).not.toHaveBeenCalled();
    expect(mocks.prisma.activity.create).not.toHaveBeenCalled();
  });

  test('completes idempotently and records only the first member completion', async () => {
    const completed = { ...task, state: 'COMPLETED', completedAt: new Date('2026-10-22T12:00:00.000Z'), completedById: 'member-1' };
    mocks.prisma.crmTask.findUnique.mockResolvedValueOnce(task).mockResolvedValueOnce(completed);
    mocks.prisma.crmTask.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.crmTask.findUniqueOrThrow.mockResolvedValue(completed);

    const first = await PATCH(new Request('http://localhost/api/crm/tasks/task-1', { method: 'PATCH', body: JSON.stringify({ action: 'COMPLETE' }) }), { params: Promise.resolve({ id: 'task-1' }) });
    const retry = await PATCH(new Request('http://localhost/api/crm/tasks/task-1', { method: 'PATCH', body: JSON.stringify({ action: 'COMPLETE' }) }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(mocks.prisma.crmTask.updateMany).toHaveBeenCalledOnce();
    expect(mocks.prisma.activity.create).toHaveBeenCalledOnce();
    expect(mocks.prisma.activity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: 'member-1', type: 'CRM_TASK_COMPLETED' }) });
  });

  test('rejects stale reschedule instead of overwriting a newer action', async () => {
    const current = { ...task, updatedAt: new Date('2026-10-22T12:00:00.000Z') };
    mocks.prisma.crmTask.findUnique.mockResolvedValueOnce(task).mockResolvedValueOnce(current);
    mocks.prisma.crmTask.updateMany.mockResolvedValue({ count: 0 });

    const response = await PATCH(new Request('http://localhost/api/crm/tasks/task-1', {
      method: 'PATCH', body: JSON.stringify({ action: 'UPDATE', dueDate: '2026-10-26T15:30:00.000Z', expectedUpdatedAt: task.updatedAt.toISOString() })
    }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(409);
    expect(mocks.prisma.activity.create).not.toHaveBeenCalled();
  });

  test('reschedules and reassigns a pending task with an audited, conditional update', async () => {
    const updated = { ...task, dueDate: new Date('2026-10-26T15:30:00.000Z'), assigneeId: 'member-3', updatedById: 'member-1' };
    mocks.prisma.memberProfile.findUnique.mockResolvedValue({ id: 'member-3' });
    mocks.prisma.crmTask.findUnique.mockResolvedValue(task);
    mocks.prisma.crmTask.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.crmTask.findUniqueOrThrow.mockResolvedValue(updated);

    const response = await PATCH(new Request('http://localhost/api/crm/tasks/task-1', {
      method: 'PATCH', body: JSON.stringify({ action: 'UPDATE', dueDate: '2026-10-26T15:30:00.000Z', assigneeId: 'member-3', expectedUpdatedAt: task.updatedAt.toISOString() })
    }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(200);
    expect(mocks.prisma.crmTask.updateMany).toHaveBeenCalledWith({
      where: { id: 'task-1', state: 'PENDING', updatedAt: task.updatedAt },
      data: expect.objectContaining({ dueDate: new Date('2026-10-26T15:30:00.000Z'), assigneeId: 'member-3', updatedById: 'member-1' })
    });
    expect(mocks.prisma.activity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: 'member-1', type: 'CRM_TASK_UPDATED' }) });
  });

  test('cancels a task once and stores the authenticated member and cancellation event', async () => {
    const cancelled = { ...task, state: 'CANCELLED', cancelledAt: new Date('2026-10-22T12:00:00.000Z'), cancelledById: 'member-1' };
    mocks.prisma.crmTask.findUnique.mockResolvedValue(task);
    mocks.prisma.crmTask.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.crmTask.findUniqueOrThrow.mockResolvedValue(cancelled);

    const response = await PATCH(new Request('http://localhost/api/crm/tasks/task-1', { method: 'PATCH', body: JSON.stringify({ action: 'CANCEL' }) }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(200);
    expect(mocks.prisma.crmTask.updateMany).toHaveBeenCalledWith({ where: { id: 'task-1', state: 'PENDING' }, data: expect.objectContaining({ state: 'CANCELLED', cancelledById: 'member-1' }) });
    expect(mocks.prisma.activity.create).toHaveBeenCalledOnce();
    expect(mocks.prisma.activity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: 'member-1', type: 'CRM_TASK_CANCELLED' }) });
  });
});
