# Busca progressiva real do OpenStreetMap

## Objetivo

Substituir a paginação local, que apenas divide uma resposta já recebida, por lotes reais e incrementais de prospects. Cada acionamento de “Carregar mais resultados” deve consultar uma parte ainda não processada do conjunto de busca e acrescentar apenas empresas inéditas.

## Escopo

- País: Brasil.
- Nicho fixo: estética automotiva, incluindo detalhamento, lavagem, lava-jato, car wash, oficina, mecânica, polimento, higienização, funilaria, martelinho, auto center, autopeças e garagem.
- Dados apresentados: nome, contato disponível, Instagram, WhatsApp e link do Google Maps.
- Sem crawling de sites e sem APIs pagas.

## Fluxo

1. A primeira pesquisa cria uma sessão temporária no servidor com filtros, lista de unidades de coleta e IDs OSM já devolvidos.
2. Uma unidade de coleta é uma combinação de área e família de consulta. Para Brasil, as áreas são os estados e as famílias separam tags estruturadas de nomes comerciais; assim uma resposta grande não corta o restante do setor.
3. A rota devolve `businesses`, `searchId` e `hasMore`.
4. “Carregar mais resultados” envia o `searchId`; o servidor processa a próxima unidade, remove duplicados contra a sessão e devolve o lote inédito seguinte.
5. O frontend anexa o lote à lista já exibida, reordena por prioridade e mantém o botão ativo enquanto `hasMore` for verdadeiro.

## Limites e falhas

- As chamadas usam o agendador atual de uma requisição por segundo para respeitar as instâncias públicas do OSM.
- Falha ou timeout de uma unidade não encerra a sessão: ela é marcada como processada e a próxima tentativa pode continuar pela unidade seguinte.
- Sessões expiram em 15 minutos e são mantidas apenas em memória, pois o projeto roda localmente. Quando expirarem, o frontend solicita uma nova pesquisa em vez de fingir que ainda há resultados.
- Não há promessa de quantidade fixa: o total depende do cadastro público do OSM. O botão passa a buscar dados novos de fato até esgotar todas as unidades.

## Testes

- Serviço: cada lote avança para uma nova unidade; IDs devolvidos antes não reaparecem.
- Rota: devolve `searchId` e permite continuar uma sessão.
- Tela: o botão de carregar chama a rota de continuação e aumenta a lista em vez de trocar de página.
- Regressão: manter links de Instagram, WhatsApp e Google Maps.
