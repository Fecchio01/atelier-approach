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
  it('keeps the initial contact section focused on contact and offers a separate sales tab', () => {
    const html = render();
    expect(html).toContain('Venda');
    expect(html).not.toContain('Plano mensal');
    expect(html).not.toContain('Fechar negócio');
    expect(html).toContain('Descartar empresa');
    expect(html).not.toContain('value="WON"');
    expect(html).not.toContain('>Próxima ação</button>');
    expect(html).not.toContain('Canal da atividade');
    expect(html).not.toContain('type="datetime-local"');
    expect(html).not.toContain('Agendar follow-up');
  });

  it('allows manually scheduling a follow-up from active funnel stages after contact', () => {
    const html = render({ stage: 'IN_CONVERSATION' });

    expect(html).toContain('Agendar follow-up');
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
    expect(html).not.toContain('Salvar valores da venda');
    expect(html).not.toContain('699,90');
    expect(html).not.toContain('199,90');
    expect(html).not.toContain('>Fechar negócio</button>');
  });

  it('labels the company category as its niche and translates Overture category codes', () => {
    const html = render({ category: 'automotive_repair' });

    expect(html).toContain('Nicho');
    expect(html).toContain('Oficina mecânica');
    expect(html).not.toContain('automotive_repair');
  });

  it('does not guess a niche when the company has no category', () => {
    const html = render({ category: null });

    expect(html).toContain('Não identificado');
    expect(html).not.toContain('Estética automotiva');
  });
});
