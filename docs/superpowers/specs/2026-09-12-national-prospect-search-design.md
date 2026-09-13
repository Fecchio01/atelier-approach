# Busca nacional e prioridade de contato

## Objetivo

Ampliar a pesquisa de prospects para cobrir categorias automotivas compatíveis e permitir busca nacional paginada, deixando a priorização compreensível e focada em canais de abordagem.

## Modos de busca

- **Região:** usa cidade e raio de 1 a 50 km. A consulta reúne os marcadores OSM de lavagem/estética automotiva e reparação/oficina relacionados ao nicho digitado.
- **Brasil inteiro:** elimina o raio e consulta o território brasileiro por uma grade limitada de áreas. A API devolve uma página por vez, com cursor para a próxima página; não tenta carregar o país inteiro em uma única chamada.

## Priorização visível

O selo numérico de pontos é removido da lista. Cada card mostra chips claros: `WhatsApp`, `Instagram`, `Site`, `Telefone` ou `Sem canal direto`.

A ordenação é: WhatsApp + Instagram, WhatsApp, Instagram/site, telefone, sem contato. O score interno pode continuar existindo para filtros, mas não representa probabilidade de venda e não é apresentado como prioridade comercial.

## Limites e segurança

- A busca nacional retorna no máximo 50 empresas por página e usa cache curto por nicho/página.
- As consultas continuam respeitando o agendador global de uma requisição OSM por segundo e o fallback Overpass.
- Empresas são deduplicadas por `osmId` entre blocos e páginas.
- A interface exibe carregamento, página atual e ação “Carregar mais”; falhas parciais não apagam os resultados já entregues.

## Imagens Google

Imagens de Google não serão coletadas por raspagem. A futura integração de imagens somente poderá usar uma API oficial de Places com chave e cobrança configuradas.

## Testes

- Unidade para a seleção de marcadores automotivos e para deduplicação/paginação nacional.
- Unidade para a ordenação e rótulos de contato.
- Fluxo ponta a ponta com resultado regional, página nacional seguinte e ações clicáveis.
