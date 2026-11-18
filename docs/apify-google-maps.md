# Google Maps via Apify no Darwin

O Darwin pode usar o ator `compass/crawler-google-places` para obter resultados públicos do Google Maps. O fluxo automático faz uma única execução Apify por campanha e guarda o `runId` no checkpoint da campanha para evitar buscas repetidas. Overture continua sendo a fonte principal e preenche a pesquisa quando a integração está desligada ou indisponível.

## Configuração

Defina as duas variáveis somente no ambiente do servidor:

- `APIFY_PROSPECTING_ENABLED=true` para ativar as execuções do Darwin.
- `APIFY_API_TOKEN` com o token privado da conta Apify.

O exemplo local mantém a integração desligada por padrão. Nunca coloque o token no navegador, no repositório ou em logs.

## Limite de uso

Cada execução é limitada pelo endpoint do Apify a US$ 0,60 e a entrada configurada pela skill usa até 60 lugares. O teto por execução não é uma garantia de gratuidade: a conta pode consumir créditos ou gerar cobrança conforme seu plano. O código não ativa Apify no deploy sem a variável de ativação e o token. Não habilite a automação diária sem confirmar o plano/limite de gastos da conta.

## Dados e revisão

Os registros são marcados como `Google Maps (Apify)`, usam `placeId` como ID externo e preservam os campos publicados necessários ao candidato. Telefone de Maps fica como telefone publicado, não como WhatsApp confirmado. O ator não envia mensagens nem move candidatos ao funil. Veja a skill versionada em `.agents/skills/prospeccao-google/SKILL.md`.
