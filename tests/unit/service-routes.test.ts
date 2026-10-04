import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.user }));
vi.mock('../../lib/db', () => ({ prisma: { serviceCatalogItem: { findMany: mocks.findMany, create: mocks.create, update: mocks.update } } }));
import { GET, POST } from '../../app/api/services/route';
import { PATCH } from '../../app/api/services/[id]/route';

const request = (body: unknown, method = 'POST') => new Request('http://localhost/api/services', { method, body: JSON.stringify(body) });
const context = { params: Promise.resolve({ id: 'service-1' }) };

describe('authenticated shared service catalog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ id: 'member-1' });
  });
  test('all endpoints require authentication', async () => {
    mocks.user.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(request({}))).status).toBe(401);
    expect((await PATCH(request({}, 'PATCH'), context)).status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  test('lists only active services', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'service-1', name: 'Site', price: '500.00', billingType: 'ONE_TIME', isActive: true }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ services: [{ id: 'service-1' }] });
    expect(mocks.findMany).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { name: 'asc' } });
  });
  test('creates a monthly service with normalized name and exact price', async () => {
    mocks.create.mockImplementation(async ({ data }) => ({ id: 'service-1', ...data }));
    const response = await POST(request({ name: ' Manutenção ', price: '199.90', billingType: 'MONTHLY' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ service: { name: 'Manutenção', price: '199.90', billingType: 'MONTHLY' } });
  });
  test.each([
    { name: ' ', price: 10, billingType: 'MONTHLY' },
    { name: 'Site', price: -1, billingType: 'ONE_TIME' },
    { name: 'Site', price: 'bad', billingType: 'ONE_TIME' },
    { name: 'Site', price: 1.001, billingType: 'ONE_TIME' },
    { name: 'Site', price: 10, billingType: 'YEARLY' },
    null, [], {}
  ])('rejects invalid creation data %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  test('edits the catalog item', async () => {
    mocks.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
    const response = await PATCH(request({ name: ' Site novo ', price: 99.9, billingType: 'ONE_TIME' }, 'PATCH'), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ service: { id: 'service-1', name: 'Site novo', price: '99.90', billingType: 'ONE_TIME' } });
  });
  test('archives by updating isActive without deleting the service', async () => {
    mocks.update.mockResolvedValue({ id: 'service-1', isActive: false });
    expect((await PATCH(request({ isActive: false }, 'PATCH'), context)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'service-1' }, data: { isActive: false } });
  });
  test.each([{ price: -1 }, { billingType: 'YEARLY' }, { name: '' }, { isActive: 'false' }, {}, null])('rejects invalid edit %j', async (body) => {
    expect((await PATCH(request(body, 'PATCH'), context)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  test('returns 404 for a nonexistent item', async () => {
    mocks.update.mockRejectedValue({ code: 'P2025' });
    expect((await PATCH(request({ isActive: false }, 'PATCH'), context)).status).toBe(404);
  });
});
