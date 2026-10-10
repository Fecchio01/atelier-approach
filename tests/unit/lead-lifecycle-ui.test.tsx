import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: vi.fn(), deleteMany: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.user }));
vi.mock('../../lib/db', () => ({ prisma: { lead: { deleteMany: mocks.deleteMany } } }));
vi.mock('@phosphor-icons/react', () => ({
  ArrowsLeftRightIcon: () => null, ArrowSquareOutIcon: () => null, GlobeIcon: () => null,
  InstagramLogoIcon: () => null, MapPinIcon: () => null, PhoneIcon: () => null,
  StorefrontIcon: () => null, TrashIcon: () => null, WhatsappLogoIcon: () => null
}));

import { KanbanBoard, type CrmLead } from '../../components/kanban-board';
import { EmptyTrashConfirmation } from '../../components/kanban-board';
import { DELETE } from '../../app/api/leads/trash/route';

const lead: CrmLead = {
  id: 'crm-lead', name: 'Oficina do Vale', osmId: 'node/42', phone: null, website: null,
  instagram: null, whatsapp: null, address: null, category: null, latitude: null,
  longitude: null, stage: 'FOLLOW_UP', saleValue: null, mrr: null, activities: [], followUps: [],
  followUpOriginStage: 'IN_CONVERSATION', stageEnteredAt: '2026-10-01T10:00:00.000Z', postFollowUpAt: null, discardedAt: null
};

function renderBoard(leads: CrmLead[], focusedLeadId?: string) {
  vi.stubGlobal('React', React);
  return renderToStaticMarkup(React.createElement(KanbanBoard, { leads, focusedLeadId, services: [], followUpDelayDays: 2 }));
}

describe('CRM lifecycle UI and empty-trash API without database', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ id: 'member-1' });
    mocks.deleteMany.mockResolvedValue({ count: 2 });
  });
  afterEach(() => vi.unstubAllGlobals());

  test('shows a localized follow-up origin on its card and detail, but does not infer a legacy origin', () => {
    expect(renderBoard([lead])).toContain('Veio de Em conversa');
    expect(renderBoard([{ ...lead, followUpOriginStage: null }])).not.toContain('Veio de');
    expect(renderBoard([lead], lead.id)).toContain('Veio de Em conversa');
  });

  test('shows the empty-trash entry point only while discarded leads exist', () => {
    expect(renderBoard([lead])).not.toContain('Esvaziar lixeira');
    expect(renderBoard([{ ...lead, id: 'discarded', stage: 'DISCARDED', followUpOriginStage: null }])).toContain('Esvaziar lixeira');
  });

  test('confirmation clearly states that emptying the trash is permanent', () => {
    const html = renderToStaticMarkup(React.createElement(EmptyTrashConfirmation, {
      count: 2, busy: false, error: null, onCancel: () => {}, onConfirm: () => {}
    }));
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('exclui permanentemente');
    expect(html).toContain('Não pode ser desfeita');
    expect(html).toContain('Confirmar exclusão permanente');
  });

  test('requires a member and independently limits trash deletion to discarded leads', async () => {
    mocks.user.mockResolvedValueOnce(null);
    expect((await DELETE()).status).toBe(401);
    expect(mocks.deleteMany).not.toHaveBeenCalled();

    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deletedCount: 2 });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { stage: 'DISCARDED' } });
  });
});
