# Atelier Approach

MVP interno para pesquisar empresas no OpenStreetMap, registrar abordagens em um CRM compartilhado e acompanhar metas, follow-ups e relatórios comerciais.

## Requisitos

- Node.js 20 ou superior
- Acesso ao projeto Supabase `Atelier Approach` e sua string de conexão PostgreSQL

## Configuração

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env` e preencha os valores abaixo.
3. Configure `DATABASE_URL` com o pool transacional Supavisor da Supabase (porta `6543`), `pgbouncer=true` e `connection_limit=1`, adequado às funções serverless da Vercel. O esquema `atelier` já foi criado no projeto.
4. Gere o cliente Prisma com `npx prisma generate`.
5. Inicie com `npm run dev`.

```env
DATABASE_URL="postgresql://atelier_app.PROJECT_REF:PASSWORD@POOLER_HOST:6543/postgres?schema=atelier&sslmode=require&pgbouncer=true&connection_limit=1"
TEST_DATABASE_URL="postgresql://atelier_app.PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres?schema=atelier_test&sslmode=require"
AUTH_SECRET="gere-um-segredo-longo-e-aleatorio"
AUTH_INTERNAL_EMAIL="equipe@exemplo.com"
AUTH_INTERNAL_PASSWORD="uma-senha-forte"
CRON_SECRET="um-segredo-aleatorio-para-o-cron-da-vercel"
```

O banco está no projeto Supabase `gxvdqmfjawnktpqguvvr`, região `sa-east-1`. A aplicação acessa as tabelas no esquema privado `atelier` pelo servidor. As migrações atuais em `prisma/migrations` são PostgreSQL; o histórico antigo de SQLite está arquivado em `prisma/legacy-sqlite-migrations` e não deve ser aplicado ao PostgreSQL.

No Supabase, alterações de schema devem ser aplicadas em ordem com uma conexão privilegiada que possua as tabelas e os tipos enum. Depois de conferir o DDL aplicado, registre cada versão no histórico Prisma com `npx prisma migrate resolve --applied NOME_DA_MIGRACAO`, usando uma conexão direta ou o pool em modo sessão para o schema correspondente. Não execute `prisma migrate deploy` com a conta `atelier_app`: ela é a conta de execução da aplicação e não possui os tipos enum. Valide primeiro no schema isolado `atelier_test`; a URL de produção usa o schema `atelier`.

Os testes usam o esquema isolado `atelier_test` e apagam seus dados no início de cada execução. Configure `TEST_DATABASE_URL` antes de rodá-los.

## Acesso e perfil

As contas criadas no banco usam a tabela `MemberCredential` no esquema `atelier`, com senhas protegidas por scrypt. A tela de login usa essas contas; as credenciais internas configuradas no `.env` continuam disponíveis para membros antigos sem senha no banco. Cada pessoa pode atualizar nome e foto em **Meu perfil** e trocar a senha informando a senha atual. Depois da troca, o sistema pede um novo login.

## Pesquisa de empresas e fontes

As empresas são pesquisadas no Overture Maps Places, pelo catálogo STAC público, e lidas em GeoParquet com DuckDB. Nominatim e dados do OpenStreetMap fornecem limites e geocodificação de cidades. Overpass permanece como código legado e não é a fonte atual dos leads. O catálogo STAC é consultado durante a pesquisa, então uma campanha ainda não fixa a versão do dataset entre retomadas.

Os resultados exibem a atribuição das fontes usadas. Empresas já inseridas no CRM são filtradas da pesquisa; se duas pessoas tentarem cadastrar a mesma empresa, a segunda é direcionada ao registro já existente. O enriquecimento de site deve preencher apenas dados publicados pela própria empresa.

## CRM compartilhado e ciclo de vida

As alterações comerciais usam uma transação comum com autoria identificada como `HUMAN`, `AGENT` ou `SYSTEM`. Cada lead tem uma versão inteira para rejeitar alterações baseadas em dados desatualizados; clientes do CRM enviam a versão ao salvar.

O follow-up automático considera a data mais recente entre a entrada na etapa e um contato significativo registrado. Um contato recente limpa um prazo antigo de descarte pós-follow-up. Leads em `PROPOSAL` ou `MEETING`, além de leads com reunião futura, são protegidos do descarte automático. A política mantém a lixeira manual e a retenção atual dos itens já descartados.

O cron em `vercel.json` chama `/api/cron/crm-lifecycle` diariamente às 03:00 UTC. Configure `CRON_SECRET` no ambiente local e no projeto Vercel para autorizar a execução; a rota retorna 401 se o segredo estiver ausente ou não corresponder.

## Verificação

```bash
npm run lint
npx vitest run
npx playwright test
npm run build
```
