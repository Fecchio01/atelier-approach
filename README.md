# Atelier Approach

MVP interno para pesquisar empresas no OpenStreetMap, registrar abordagens em um CRM compartilhado e acompanhar metas, follow-ups e relatórios comerciais.

## Requisitos

- Node.js 20 ou superior
- Acesso de escrita ao diretório `prisma/` (o MVP usa SQLite)

## Configuração

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env` e preencha os valores abaixo.
3. Aplique o esquema com `npx prisma db push`.
4. Inicie com `npm run dev`.

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="gere-um-segredo-longo-e-aleatorio"
AUTH_INTERNAL_EMAIL="equipe@exemplo.com"
AUTH_INTERNAL_PASSWORD="uma-senha-forte"
```

## Pesquisa OpenStreetMap

A pesquisa usa os serviços públicos Nominatim e Overpass do OpenStreetMap. Mantenha buscas moderadas: a aplicação limita cada pessoa autenticada a cinco buscas por minuto e comunica indisponibilidade temporária sem perder o contexto da tela. Para produção, informe um `User-Agent` identificável nas requisições e siga as políticas de uso dos serviços.

Os resultados exibem a atribuição obrigatória ao OpenStreetMap. Empresas já inseridas no CRM são filtradas da pesquisa; se duas pessoas tentarem cadastrar a mesma empresa, a segunda é direcionada ao registro já existente.

## Verificação

```bash
npm run lint
npx vitest run
npx playwright test
npm run build
```
