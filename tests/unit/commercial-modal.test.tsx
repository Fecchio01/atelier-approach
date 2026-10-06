import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Icon loading is unrelated to commercial behavior; keep the real modal and controls.
vi.mock('@phosphor-icons/react', () => ({
  ArrowSquareOutIcon: () => null, GlobeIcon: () => null, InstagramLogoIcon: () => null,
  MapPinIcon: () => null, PhoneIcon: () => null, StorefrontIcon: () => null,
  TrashIcon: () => null, WhatsappLogoIcon: () => null
}));

import { LeadDetailModal } from '../../components/lead-detail-modal';
import type { CrmLead } from '../../components/kanban-board';

const lead: CrmLead = {
  id: 'lead', name: 'Oficina', osmId: 'node/1', phone: null, website: null,
  instagram: null, whatsapp: null, address: null, category: null, latitude: null,
  longitude: null, stage: 'CONTACTED', saleValue: null, mrr: null, activities: [], followUps: []
};

function render(overrides: Partial<CrmLead> = {}) {
  vi.stubGlobal('React', React);
  return renderToStaticMarkup(React.createElement(LeadDetailModal, {
    lead: { ...lead, ...overrides }, onClose: () => {}, onUpdated: () => {}, onDeleted: () => {},
    services: [{ id: 'monthly', name: 'Plano mensal', price: '199.90', billingType: 'MONTHLY' }],
    followUpDelayDays: 3
  }));
}

describe('commercial lead controls', () => {
  it('offers catalog closing and discard directly in the initial contact section', () => {
    const html = render();
    expect(html).toContain('Plano mensal');
    expect(html).toContain('Fechar negócio');
    expect(html).toContain('Descartar empresa');
    expect(html).toContain('Os valores desta venda ficarão em zero.');
    expect(html).not.toContain('value="WON"');
    expect(html).not.toContain('>Próxima ação</button>');
    expect(html).not.toContain('Canal da atividade');
  });

  it('explains automatic scheduling and displays the pending follow-up date', () => {
    const html = render({ stage: 'FOLLOW_UP', followUps: [{ id: 'follow-up', state: 'PENDING', dueDate: '2026-10-08T14:30:00.000Z' }] });
    expect(html).toContain('3 dias');
    expect(html).toContain('2026-10-08T14:30:00.000Z');
    expect(html).toContain('Reagendar follow-up');
    expect(html).toContain('Concluir follow-up');
    expect(html).toContain('Cancelar follow-up');
  });

  it('shows financial corrections for an already won lead in contact', () => {
    const html = render({ stage: 'WON', saleValue: '699.90', mrr: '199.90' });
    expect(html).toContain('Salvar valores da venda');
    expect(html).toContain('699,90');
    expect(html).toContain('199,90');
    expect(html).not.toContain('>Fechar negócio</button>');
  });
});
