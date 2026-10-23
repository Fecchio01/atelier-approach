import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@phosphor-icons/react', () => ({
  ArrowSquareOutIcon: () => null, GlobeIcon: () => null, InstagramLogoIcon: () => null,
  MapPinIcon: () => null, PhoneIcon: () => null, StorefrontIcon: () => null,
  TrashIcon: () => null, WhatsappLogoIcon: () => null
}));

import { LeadDetailModal } from '../../components/lead-detail-modal';
import type { CrmLead } from '../../components/kanban-board';

const lead: CrmLead = {
  id: 'lead-1', name: 'Oficina Central', osmId: 'node/central', phone: null, website: null,
  instagram: null, whatsapp: null, address: null, category: 'auto repair', latitude: null,
  longitude: null, stage: 'CONTACTED', saleValue: null, mrr: null, activities: [], followUps: [], detailsLoaded: true
};

describe('CRM task company-detail entry point', () => {
  test('offers a task action for the open company and receives only the team member choices', () => {
    const html = renderToStaticMarkup(React.createElement(LeadDetailModal, {
      lead, services: [], followUpDelayDays: 2,
      members: [{ id: 'member-1', name: 'João' }], currentMemberId: 'member-1',
      onClose: () => undefined, onUpdated: () => undefined, onDeleted: () => undefined
    }));

    expect(html).toContain('data-testid="lead-create-crm-task"');
    expect(html).toContain('data-lead-id="lead-1"');
    expect(html).toContain('Criar ação');
  });
});
