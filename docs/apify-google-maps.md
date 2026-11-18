# Google Maps via Apify no Darwin

O Darwin tem integração opcional com o ator `compass/crawler-google-places` para obter resultados públicos do Google Maps. Novas execuções pagas ficam desativadas por padrão. O caminho gratuito cruza nome e coordenadas da Overture com um registro independente do OpenStreetMap; resultados sem correspondência não são exibidos.

## Configuração

Defina as duas variáveis somente no ambiente do servidor:

- `APIFY_PAID_SEARCH_AUTHORIZED=true` e `APIFY_PROSPECTING_ENABLED=true` para habilitar execuções pagas do Darwin. A primeira variável funciona como trava adicional para evitar ativação acidental.
- `APIFY_API_TOKEN` com o token privado da conta Apify.

O exemplo local mantém a integração desligada por padrão. Não habilite sem autorização explícita de custo. Nunca coloque o token no navegador, no repositório ou em logs.

## Limite de uso

Cada execução pode custar até US$ 0,60 e a entrada configurada pela skill usa até 60 lugares. Esse teto não garante gratuidade. O usuário não autorizou custo para esta correção, então novas chamadas devem permanecer desativadas.

## Dados e revisão

Registros retornados por uma futura busca autorizada são marcados como `Google Maps (Apify)`, usam `placeId` como ID externo e preservam os campos publicados necessários ao candidato. Telefone de Maps fica como telefone publicado, não como WhatsApp confirmado. O ator não envia mensagens nem move candidatos ao funil. Veja a skill versionada em `.agents/skills/prospeccao-google/SKILL.md`.

## Limite da validação gratuita

A correspondência exata de nome a até 150 metros confirma que há um registro equivalente no OpenStreetMap, não que o negócio esteja aberto hoje nem que tenha uma ficha ativa no Google Maps. Quando um resultado foi validado por essa correspondência, o link do cartão abre as coordenadas, sem procurar um nome potencialmente ambíguo. Se a fonte gratuita estiver indisponível, o sistema falha fechado e não libera resultados sem confirmação.
