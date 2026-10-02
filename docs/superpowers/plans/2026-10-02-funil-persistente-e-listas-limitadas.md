# Funil persistente e listas limitadas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manter empresas e mudanças de etapa no CRM após navegação/recarga e permitir rolar listas longas sem empurrar as seções inferiores para longe.

**Architecture:** PostgreSQL continua sendo a fonte de verdade para Lead, Activity e StageHistory. O Kanban terá um scroll vertical limitado por etapa, separado do scroll horizontal do quadro; testes E2E cobrirão rolagem, lote 7+3, transição de etapa, retorno de página, reload e falha de gravação.

**Tech Stack:** Next.js App Router, React, Prisma/PostgreSQL, Tailwind CSS, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-funil-persistente-e-listas-limitadas-design.md`

## Global Constraints

- O banco é a fonte de verdade; não criar uma segunda cópia no `localStorage`.
- Nenhum lead pode ser ocultado ou removido pelo limite visual; todos devem continuar acessíveis dentro da etapa.
- A rolagem horizontal do quadro no celular deve continuar disponível junto com a rolagem vertical de cada etapa.
- “Descartar” preserva lead e histórico na Lixeira; “Devolver para pesquisa” continua destrutivo e exige confirmação.
- Nenhum erro de leitura deve ser convertido em uma lista vazia que pareça uma exclusão.
- Os E2E que escrevem no banco devem usar somente `TEST_DATABASE_URL` com schema `atelier_test` e limpar os registros criados.
- Fazer commit de cada tarefa concluída e testada.

## Review Focus

- Conteúdo maior que a altura do Kanban: a lista interna rola, todos os cards continuam acessíveis e Lixeira não fica depois de todos eles (Task 1).
- Viewport mobile com gestos verticais e horizontais concorrentes: a lista vertical e o quadro horizontal continuam navegáveis (Task 1).
- Inclusão em lotes enquanto a aba fica suspensa: os 7 leads iniciais e os 3 seguintes reaparecem ao voltar (Task 2).
- Mudança de etapa seguida por navegação e reload: o lead fica na etapa gravada e seu total não diminui (Task 2).
- Resposta de erro na alteração: o lead permanece na etapa original e a pessoa vê o erro, sem sucesso visual falso (Task 3).

---

### Task 1: Limitar a rolagem interna de cada etapa

**Files:**
- Modify: `components/kanban-board.tsx`
- Test: `tests/e2e/crm-resume-and-trash.spec.ts`

**Interfaces:**
- Produces: cada etapa contém uma lista de cards identificável por `data-testid="crm-stage-lead-list"`, com altura máxima responsiva, rolagem vertical e contenção de overscroll.
- Consumes: nomes de etapa continuam expostos pelos `section` com `aria-label` existentes; nenhum contrato da API muda.

- [ ] **Step 1: Escrever E2E de limite e acessibilidade de todos os cards**

Acrescentar um teste aos viewports desktop (1440×900) e mobile (390×844) já usados em `crm-resume-and-trash.spec.ts`. Autenticar, criar dez leads únicos via `POST /api/leads`, abrir `/crm` e, na etapa Abordado, localizar a lista atual com `stage.locator(':scope > div.grid.gap-3')` e confirmar que `scrollHeight > clientHeight` (o teste deve falhar antes da implementação). Rolar a lista até o último card e confirmar que ele continua acessível; rolar a página até Lixeira e confirmar que a seção está visível sem remover nenhum lead. No mobile, confirmar também que o quadro externo continua horizontalmente rolável e que seu `touchAction` computado é `auto`. Limpar os leads no `finally`, exigindo o schema isolado `atelier_test` como nos testes existentes.

- [ ] **Step 2: Executar o E2E para confirmar que ele detecta o defeito atual**

Run: `npm run test:e2e -- tests/e2e/crm-resume-and-trash.spec.ts`
Expected: FAIL porque a lista ainda não possui limite de altura nem rolagem própria.

- [ ] **Step 3: Implementar a lista rolável em `components/kanban-board.tsx`**

Mover `data-testid="crm-stage-lead-list"` para o contêiner que envolve os cards e o estado vazio. Aplicar `min-h-0`, `max-h-[clamp(16rem,65dvh,36rem)]`, `overflow-y-auto` e `overscroll-y-contain`; manter cabeçalho e contador fora desse contêiner. No quadro horizontal externo, substituir `touch-pan-x` por `touch-auto` e manter `overflow-x-auto`/`overscroll-x-contain`, para o navegador poder direcionar gestos verticais à lista interna sem bloquear o swipe horizontal entre etapas. Atualizar o seletor do E2E para `stage.getByTestId('crm-stage-lead-list')` depois de adicionar esse `data-testid`.

- [ ] **Step 4: Executar E2E mobile e desktop e confirmar a rolagem**

Run: `npm run test:e2e -- tests/e2e/crm-resume-and-trash.spec.ts`
Expected: PASS nos dois viewports; todos os dez cards são alcançáveis, a rolagem é interna à etapa e a Lixeira permanece alcançável pelo scroll normal da página.

- [ ] **Step 5: Commitar a tarefa**

```bash
git add components/kanban-board.tsx tests/e2e/crm-resume-and-trash.spec.ts
git commit -m "fix: bound CRM stage list scrolling"
```

### Task 2: Provar persistência do lote e de transições após navegação/reload

**Files:**
- Modify: `tests/e2e/crm-resume-and-trash.spec.ts`
- Modify: `tests/e2e/crm-modal.spec.ts`
- Modify only if the test fails: `components/kanban-board.tsx`, `components/lead-detail-modal.tsx`, `app/api/leads/[id]/route.ts`

**Interfaces:**
- Consumes: `POST /api/leads` para inclusão e `PATCH /api/leads/[id]` para movimentação; etapas mantêm os valores atuais do enum `LeadStage`.
- Produces: cenários E2E que provam que dez leads e uma etapa alterada são reobtidos após retorno, navegação e reload; descarte permanece na Lixeira e devolução só apaga após confirmação.

- [ ] **Step 1: Estender o teste de retorno externo com a sequência completa**

No teste de 7+3 já existente, depois de confirmar dez cards em Abordado, abrir um lead, escolher `QUALIFIED`, salvar e confirmar a saída de Abordado e entrada em Qualificado. Navegar para `/metas`, voltar para `/crm` e executar `page.reload()`. Então confirmar nove cards de teste em Abordado, um em Qualificado, os dez nomes do lote presentes no quadro e a etapa final no banco consultado por `PrismaClient` ligado a `TEST_DATABASE_URL`. Rodar em desktop e mobile; manter a limpeza isolada no `finally`.

- [ ] **Step 2: Cobrir recarga da Lixeira e devolução confirmada**

Estender o teste existente de descarte para recarregar `/crm` após o sucesso e confirmar que o lead segue na Lixeira. Estender o teste existente de devolução para recarregar `/crm` após a confirmação e confirmar que o lead continua ausente. Nas duas situações, manter os asserts de histórico e confirmação atuais.

- [ ] **Step 3: Executar os cenários para verificar persistência já existente**

Run: `npm run test:e2e -- tests/e2e/crm-resume-and-trash.spec.ts tests/e2e/crm-modal.spec.ts`
Expected: PASS para desktop/mobile; se falhar, preservar a falha como evidência e identificar se é retorno da aba, gravação da etapa ou leitura após reload antes de alterar código.

- [ ] **Step 4: Corrigir somente o ponto de persistência/refetch comprovadamente defeituoso, se necessário**

Manter a gravação de etapa e `StageHistory` na transação atual. Não adicionar `localStorage`, novo banco ou cópia de estado como fonte de verdade. A UI só confirma movimento após sucesso do `PATCH`; navegação/reload carrega os registros do Prisma.

- [ ] **Step 5: Reexecutar os testes de lote, transição, descarte e reload**

Run: `npm run test:e2e -- tests/e2e/crm-resume-and-trash.spec.ts tests/e2e/crm-modal.spec.ts`
Expected: PASS em desktop e mobile, com dez leads persistidos no banco e na etapa correta após cada retorno/reload; descarte preservado e devolução realizada somente após confirmação.

- [ ] **Step 6: Commitar a tarefa**

```bash
git add -- tests/e2e/crm-resume-and-trash.spec.ts tests/e2e/crm-modal.spec.ts components/kanban-board.tsx components/lead-detail-modal.tsx ':(literal)app/api/leads/[id]/route.ts'
git commit -m "test: verify CRM batch and stage persistence"
```

### Task 3: Fixar o comportamento quando a API de etapa falha

**Files:**
- Modify: `tests/e2e/crm-modal.spec.ts`
- Modify only if the test fails: `components/lead-detail-modal.tsx`, `components/kanban-board.tsx`

**Interfaces:**
- Consumes: contrato atual `PATCH /api/leads/[id]` com JSON `{ stage }`; erro mantém resposta não-2xx e mensagem `error` do modal.
- Produces: teste que prova que um erro de rede/servidor não move nem remove o lead visualmente.

- [ ] **Step 1: Escrever E2E para erro ao mover etapa**

Criar um lead de teste, interceptar o `PATCH /api/leads/{id}` para responder `500` com `{ "error": "Falha de teste." }`, abrir o modal, escolher `QUALIFIED` e salvar. Verificar que o alerta mostra a mensagem, o modal permanece aberto, o card continua em Abordado, não aparece em Qualificado e o valor de `stage` no banco continua inalterado. Limpar o lead no `finally`.

- [ ] **Step 2: Executar E2E e confirmar se o comportamento atual já satisfaz o contrato**

Run: `npm run test:e2e -- tests/e2e/crm-modal.spec.ts`
Expected: PASS; se falhar, o teste localiza precisamente a regressão sem esconder o lead.

- [ ] **Step 3: Ajustar somente o tratamento da falha, se necessário**

Não chamar `onUpdated` nem alterar `stageOverrides` antes de a API confirmar sucesso. Preservar no modal a etapa atual e o erro para uma nova tentativa.

- [ ] **Step 4: Reexecutar os testes do modal e do descarte**

Run: `npm run test:e2e -- tests/e2e/crm-modal.spec.ts tests/e2e/crm-resume-and-trash.spec.ts`
Expected: PASS; movimentação bem-sucedida, erro, descarte e devolução mantêm as semânticas existentes.

- [ ] **Step 5: Commitar a tarefa**

```bash
git add tests/e2e/crm-modal.spec.ts components/lead-detail-modal.tsx components/kanban-board.tsx
git commit -m "test: preserve CRM stage on update failure"
```

### Task 4: Verificação do conjunto

**Files:**
- Test: `tests/e2e/crm-resume-and-trash.spec.ts`
- Test: `tests/e2e/crm-modal.spec.ts`
- Test: `tests/e2e/mobile-responsiveness.spec.ts`

- [ ] **Step 1: Executar a suíte E2E de regressão CRM/mobile**

Run: `npm run test:e2e -- tests/e2e/crm-resume-and-trash.spec.ts tests/e2e/crm-modal.spec.ts tests/e2e/mobile-responsiveness.spec.ts`
Expected: PASS; quadro continua utilizável em desktop e mobile, inclusive scroll horizontal e vertical, e nenhum fluxo existente de CRM se perde.

- [ ] **Step 2: Executar verificações estáticas e build**

Run: `npm run typecheck`
Expected: exit code 0.

Run: `npm run lint`
Expected: exit code 0.

Run: `npm run build`
Expected: build de produção concluído com exit code 0.
