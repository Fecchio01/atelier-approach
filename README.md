# Atelier Approach

MVP interno para pesquisar empresas no OpenStreetMap, registrar abordagens em um CRM compartilhado e acompanhar metas, follow-ups e relatórios comerciais.

## Requisitos

- Node.js 20 ou superior
- Acesso ao projeto Supabase `Atelier Approach` e sua string de conexão PostgreSQL

## Configuração

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env` e preencha os valores abaixo.
3. Configure `DATABASE_URL` com a string de conexão do banco Supabase. O esquema `atelier` já foi criado no projeto.
4. Gere o cliente Prisma com `npx prisma generate`.
5. Inicie com `npm run dev`.

```env
DATABASE_URL="postgresql://atelier_app.PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres?schema=atelier&sslmode=require"
TEST_DATABASE_URL="postgresql://atelier_app.PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres?schema=atelier_test&sslmode=require"
AUTH_SECRET="gere-um-segredo-longo-e-aleatorio"
AUTH_INTERNAL_EMAIL="equipe@exemplo.com"
AUTH_INTERNAL_PASSWORD="uma-senha-forte"
```

O banco está no projeto Supabase `gxvdqmfjawnktpqguvvr`, região `sa-east-1`. A aplicação acessa as tabelas no esquema privado `atelier` pelo servidor. As migrações antigas em `prisma/migrations` pertencem ao SQLite e não devem ser aplicadas ao PostgreSQL.

Os testes usam o esquema isolado `atelier_test` e apagam seus dados no início de cada execução. Configure `TEST_DATABASE_URL` antes de rodá-los.

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
