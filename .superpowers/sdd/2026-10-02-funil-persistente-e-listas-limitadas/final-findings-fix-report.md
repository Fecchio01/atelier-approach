# Correções dos findings finais

Data: 2026-10-02
Base: `255914f97d62fe9a15e0cf8239471741fe57038a`

## P2 — foco recortado pelo scrollport

O teste em `tests/e2e/crm-resume-and-trash.spec.ts` agora navega com Tab do início do documento até o primeiro e o último card de Abordado, confirma `:focus-visible` e verifica se a caixa expandida por `outlineWidth + outlineOffset` cabe no retângulo do scrollport.

Antes do ajuste CSS, o teste falhou nos viewports mobile e desktop: o outline esquerdo do primeiro card começava 6 px antes do scrollport. `p-1` e `p-2` reservaram o espaço geométrico do conteúdo, mas a rolagem automática ao focar o último botão ainda o alinhava na borda inferior. A combinação final `p-2 scroll-p-3` preserva espaço interno e orienta a rolagem de foco a manter a margem visível.

## P3 — confirmação da página após devolver lead

Em `tests/e2e/crm-modal.spec.ts`, após o reload, o cenário aguarda a URL `/crm` e a região `Funil CRM` visível antes de verificar que o botão do lead devolvido não existe.

## Verificação

- E2E focados (`crm-resume-and-trash.spec.ts`, `crm-modal.spec.ts`, `mobile-responsiveness.spec.ts`): **13 passaram**.
- Typecheck (`npm run typecheck`): **passou**.
- Lint (`npm run lint`): **passou**.
- O teste de geometria passou em mobile e desktop. Os cenários E2E mantiveram a configuração `atelier_test` e a limpeza dos leads criados.

Sem alterações em produção, persistência, configuração de ignores de lint, push ou deploy.
