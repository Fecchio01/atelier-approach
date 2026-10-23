import React from 'react';
import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { CrmActionQueue } from '../../components/crm-action-queue';
import { CrmTaskForm } from '../../components/crm-task-form';

describe('CRM action queue presentation', () => {
  test('distinguishes explicit tasks from follow-ups and links each company to its CRM detail', () => {
    const html = renderToStaticMarkup(React.createElement(CrmActionQueue, {
      leads: [{ id: 'lead-1', name: 'Oficina Central' }],
      members: [{ id: 'member-1', name: 'João' }],
      currentMemberId: 'member-1',
      initialItems: [
        { kind: 'TASK', id: 'task-1', leadId: 'lead-1', leadName: 'Oficina Central', title: 'Enviar proposta', taskType: 'EMAIL', dueDate: '2026-10-24T15:30:00.000Z', priority: 'HIGH', assigneeId: 'member-1', assigneeName: 'João', state: 'PENDING', updatedAt: '2026-10-20T12:00:00.000Z' },
        { kind: 'FOLLOW_UP', id: 'follow-1', leadId: 'lead-1', leadName: 'Oficina Central', title: 'Retornar ligação', dueDate: '2026-10-23T15:30:00.000Z', priority: 'NORMAL', assigneeId: 'member-1', assigneeName: 'João', state: 'PENDING' }
      ]
    }));

    expect(html).toContain('Ações do CRM');
    expect(html).toContain('Enviar proposta');
    expect(html).toContain('Retornar ligação');
    expect(html).toContain('Tarefa');
    expect(html).toContain('Follow-up');
    expect(html).toContain('Editar');
    expect(html).toContain('Concluir');
    expect(html).toContain('Cancelar');
    expect(html.match(/href="\/crm\?lead=lead-1"/g)).toHaveLength(3);
    expect(html).toContain('Atribuídas a mim');
    expect(html).toContain('Atrasadas');
    expect(html).toContain('Futuras');
  });

  test('renders a mobile-friendly action form with company, type, priority, assignee, and Sao Paulo due time', () => {
    const html = renderToStaticMarkup(React.createElement(CrmTaskForm, {
      leads: [{ id: 'lead-1', name: 'Oficina Central' }],
      members: [{ id: 'member-1', name: 'João' }],
      currentMemberId: 'member-1',
      onCancel: () => undefined,
      onSaved: () => undefined
    }));

    expect(html).toContain('Nova ação');
    expect(html).toContain('Empresa');
    expect(html).toContain('Descrição da ação');
    expect(html).toContain('Tipo de ação');
    expect(html).toContain('Prioridade');
    expect(html).toContain('Responsável');
    expect(html).toContain('Vencimento');
    expect(html).toContain('datetime-local');
    expect(html).toContain('America/Sao_Paulo');
    expect(html).toContain('min-h-11');
  });
});
