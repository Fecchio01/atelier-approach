import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: vi.fn(), create: vi.fn(), list: vi.fn(), remove: vi.fn() }));
vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.user }));
vi.mock('../../lib/metric-imports', () => ({
  createMetricImport: mocks.create,
  listMetricImports: mocks.list,
  deleteMetricImport: mocks.remove,
  MetricImportConflictError: class MetricImportConflictError extends Error {}
}));

import { GET, POST } from '../../app/api/metric-imports/route';
import { DELETE } from '../../app/api/metric-imports/[batchId]/route';
import { MetricImportConflictError } from '../../lib/metric-imports';

const jsonRequest = (body: unknown) => new Request('http://localhost/api/metric-imports', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
});

describe('metric result import routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ id: 'member-1' });
  });

  test('requires authentication for list, save and delete', async () => {
    mocks.user.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(jsonRequest({}))).status).toBe(401);
    expect((await DELETE(new Request('http://localhost'), { params: Promise.resolve({ batchId: 'batch-1' }) })).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  test('resolves author from the authenticated server session', async () => {
    mocks.create.mockResolvedValue({ batch: { id: 'batch-1' }, duplicate: false });
    const response = await POST(jsonRequest({
      fileName: 'resultado.pdf', periodStart: '2026-10-05T03:00:00.000Z', periodEnd: '2026-10-06T03:00:00.000Z',
      rows: [{ metricKey: 'meetings', customGoalId: null, label: 'Reuniões', unit: null, value: 2 }], actorId: 'forged'
    }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'member-1' }));
  });

  test('returns 409 for an unconfirmed additional batch and exposes list/removal', async () => {
    mocks.create.mockRejectedValue(new MetricImportConflictError('Confirme lote adicional'));
    expect((await POST(jsonRequest({}))).status).toBe(409);
    mocks.list.mockResolvedValue([{ id: 'batch-1' }]);
    expect((await GET()).status).toBe(200);
    mocks.remove.mockResolvedValue(true);
    expect((await DELETE(new Request('http://localhost'), { params: Promise.resolve({ batchId: 'batch-1' }) })).status).toBe(200);
  });
});
