# Busca progressiva OSM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer “Carregar mais resultados” consultar lotes novos do OpenStreetMap e anexá-los à pesquisa, em vez de apenas paginar os mesmos prospects.

**Architecture:** O serviço OSM expõe uma sessão temporária em memória identificada por `searchId`. Cada sessão guarda filtros, unidades de coleta ainda não processadas e IDs já devolvidos; a rota inicial e a rota de continuação consomem uma unidade por vez. A tela mantém a lista acumulada, ordena os lotes juntos e usa `hasMore` para controlar o botão.

**Tech Stack:** Next.js App Router, TypeScript, React, Vitest, OpenStreetMap Overpass/Nominatim.

**Spec:** `docs/superpowers/specs/2026-09-18-busca-progressiva-osm-design.md`

## Global Constraints

- País: Brasil.
- Nicho fixo: estética automotiva, incluindo detalhamento, lavagem, lava-jato, car wash, oficina, mecânica, polimento, higienização, funilaria, martelinho, auto center, autopeças e garagem.
- Dados apresentados: nome, contato disponível, Instagram, WhatsApp e link do Google Maps.
- Sem crawling de sites e sem APIs pagas.
- As chamadas usam o agendador atual de uma requisição por segundo.
- Sessões expiram em 15 minutos e ficam apenas em memória.

## Review Focus

- Continuar uma sessão depois do primeiro lote deve avançar a unidade, nunca repetir IDs.
- Dois cliques rápidos em “Carregar mais resultados” não podem consumir o mesmo cursor.
- Sessão expirada deve retornar erro orientando nova pesquisa, sem exibir lista falsa.
- Falha de uma unidade OSM deve permitir continuar para a próxima unidade.
- Nova busca deve limpar a lista anterior e o cursor anterior.

### Task 1: Sessão incremental no serviço OSM

**Files:**
- Modify: `lib/osm.ts`
- Test: `tests/unit/osm.test.ts`

**Interfaces:**
- Produces `createOsmSearchService().startSearch(input): Promise<{ searchId: string; businesses: ExternalBusiness[]; hasMore: boolean }>`.
- Produces `createOsmSearchService().continueSearch(searchId): Promise<{ businesses: ExternalBusiness[]; hasMore: boolean }>`.
- `continueSearch` lança `OsmSearchSessionExpiredError` para ID inexistente ou sessão vencida.

- [ ] **Step 1: Write the failing tests**

Adicionar testes que mockem duas respostas Overpass distintas e verifiquem que `startSearch` devolve o primeiro lote, `continueSearch` consulta a segunda unidade, não repete o primeiro `osmId`, informa `hasMore`, rejeita sessão desconhecida e continua após uma unidade que falhou.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/unit/osm.test.ts`
Expected: FAIL porque o serviço ainda expõe apenas `searchBusinesses` e não possui sessão/cursor.

- [ ] **Step 3: Implement the minimal session engine**

Criar tipos internos `SearchUnit`, `OsmSearchSession` e `SearchBatch`. Para uma pesquisa nacional, montar unidades para cada estado e duas famílias (`structured-tags` e `name-variants`); para estado/cidade, montar as mesmas famílias para a área selecionada. A sessão deve manter `nextUnitIndex`, `seenOsmIds`, filtros de entrada, `createdAt` e `lastAccessAt`. Implementar `consumeNextUnit` para executar a próxima unidade, deduplicar por `osmId`, ignorar falha individual e retornar `{ businesses, hasMore }`. Reutilizar `fetchOverpass`, `normalizeBusiness`, `dedupeBusinesses` e o agendador existentes. Expirar sessões após 15 minutos e apagar a sessão no momento da expiração.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/unit/osm.test.ts`
Expected: PASS, incluindo os testes antigos de tags, contatos, cache e disponibilidade.

- [ ] **Step 5: Commit**

```bash
git add lib/osm.ts tests/unit/osm.test.ts
git commit -m "feat: add incremental OSM search sessions"
```

### Task 2: Rotas de início e continuação

**Files:**
- Modify: `app/api/search/route.ts`
- Test: `tests/unit/search-route.test.ts`

**Interfaces:**
- `GET /api/search?...` responde `{ businesses, searchId, hasMore }`.
- `GET /api/search?searchId=<id>` responde `{ businesses, searchId, hasMore }`.
- Sessão expirada responde `410` com mensagem de nova pesquisa.

- [ ] **Step 1: Write the failing tests**

Adicionar cobertura para a resposta inicial conter `searchId`/`hasMore`, a continuação chamar o serviço com o ID e a expiração retornar `410` sem vazar detalhes internos.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/unit/search-route.test.ts`
Expected: FAIL porque a rota atual só aceita filtros e sempre chama `searchBusinesses`.

- [ ] **Step 3: Implement the route contract**

Separar o fluxo `searchId` antes da validação de nicho/região. Para o fluxo inicial, chamar `startSearch`; manter a filtragem de CRM existente no lote retornado. Para continuação, chamar `continueSearch`, aplicar os mesmos filtros/CRM guardados na sessão e devolver o lote filtrado junto com `hasMore`. Mapear `OsmSearchSessionExpiredError` para `410`; preservar `503` para indisponibilidade real e `429` para o limite de buscas iniciais.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/unit/search-route.test.ts`
Expected: PASS, com os testes existentes de autorização, filtros, CRM e erros.

- [ ] **Step 5: Commit**

```bash
git add app/api/search/route.ts tests/unit/search-route.test.ts
git commit -m "feat: expose OSM search continuation route"
```

### Task 3: Interface de lote acumulado

**Files:**
- Modify: `components/search-form.tsx`
- Modify: `app/(app)/pesquisa/page.tsx`
- Test: `tests/unit/search-form.test.ts`
- Test: `tests/e2e/acceptance.spec.ts`

**Interfaces:**
- `SearchForm` chama `onResults(results, cursor)` no início e `onFailure()` em erro.
- A página mantém `searchId`, `hasMore` e `isLoadingMore` e anexa novos resultados por `osmId`.

- [ ] **Step 1: Write the failing tests**

Adicionar teste de fonte verificando que a paginação antiga por `slice` foi removida, que o botão chama `/api/search?searchId=...` e que a contagem visível aumenta após uma resposta de continuação.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/unit/search-form.test.ts`
Expected: FAIL porque a tela usa `RESULTS_PER_PAGE`, `currentPage` e nunca envia `searchId`.

- [ ] **Step 3: Implement the accumulated results UI**

Alterar o contrato do formulário para repassar `searchId` e `hasMore`. Na página, substituir `currentPage`/`slice` por `searchId`, `hasMore` e `isLoadingMore`; no clique, chamar a rota de continuação, mesclar por `osmId`, ordenar novamente por `approachabilityRank`, e mostrar “Carregar mais resultados” enquanto houver lote. Exibir “Buscando mais empresas…” durante a continuação e uma mensagem de sessão expirada que peça nova pesquisa. Manter os links dos cards e o fluxo “Marcar como abordada”.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/unit/search-form.test.ts tests/e2e/acceptance.spec.ts`
Expected: PASS, incluindo o fluxo CRM e a regressão de pesquisa indisponível.

- [ ] **Step 5: Commit**

```bash
git add components/search-form.tsx "app/(app)/pesquisa/page.tsx" tests/unit/search-form.test.ts tests/e2e/acceptance.spec.ts
git commit -m "feat: load new OSM prospect batches in research UI"
```

### Task 4: Verificação integrada

**Files:**
- Modify: nenhum arquivo de produção; apenas ajustes de testes se uma asserção existente conflitar com o novo contrato.

- [ ] **Step 1: Run the complete suite**

Run: `npm test -- --run`
Expected: todos os testes passam sem falhas.

- [ ] **Step 2: Run static checks and build**

Run: `npm run typecheck; npm run lint; npm run build`
Expected: tipagem, lint e build passam.

- [ ] **Step 3: Verify the local server**

Run: `curl.exe -sS -I http://localhost:3000/login`
Expected: `HTTP/1.1 200 OK` ou redirecionamento válido para autenticação; não pode retornar erro 500.

- [ ] **Step 4: Commit final verification state**

```bash
git status --short
```

Confirmar que apenas arquivos da implementação/documentação ficaram modificados e que artefatos locais existentes, como `prisma/dev.db`, não foram adicionados.
