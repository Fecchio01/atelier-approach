---
name: prospeccao-google
description: Pesquisa local de empresas para o Darwin, combinando Google Maps via Apify com Overture e mantendo identidade, contato e origem dos dados claros.
---

# Prospecção no Google para o Darwin

Use esta skill quando o Darwin pesquisar empresas por nicho e região ou quando alguém revisar a qualidade de candidatos encontrados.

## Fontes e ativação

- Overture continua sendo a fonte atual de cobertura; a consulta de limites geográficos continua usando OpenStreetMap.
- Google Maps é uma fonte adicional por meio do ator Apify `compass/crawler-google-places`. Esse ator coleta dados públicos do Maps por scraping; não é uma API oficial do Google.
- Só iniciar Apify quando `APIFY_PROSPECTING_ENABLED=true` e `APIFY_API_TOKEN` estiver configurado no servidor. Se estiver desligado/sem credencial, seguir com Overture sem erro.
- Fazer no máximo uma execução Apify por campanha automática do Darwin, nunca uma execução por área Overture. Reusar o `runId` persistido no checkpoint; uma falha ambígua depois do início não deve provocar nova execução faturável.
- Limitar cada execução a `maxTotalChargeUsd: 0.60` e `maxCrawledPlacesPerSearch: 60`. Nunca aumentar, repetir para “ver se vem mais” ou iniciar uma busca extra silenciosamente.
- Não enviar a chave ao navegador, não gravar em código, banco, logs, prompt ou resposta. Configurar somente como segredo do ambiente do servidor.

## Consulta e campos

Enviar nicho e cidade/UF ao ator com idioma `pt-BR`, negócios fechados excluídos e coleta de contatos habilitada. Ler somente os campos necessários: `title`, `categoryName`, `website`, `domain`, `phone`, `totalScore`, `reviewsCount`, `placeId`, `url`, `neighborhood`, endereço e localização quando disponíveis, além de imagem quando disponível.

Normalizar cada resultado para o formato de candidato do sistema. Usar `placeId` como identidade externa, preservar proveniência `Google Maps (Apify)`, manter o link Maps fornecido pelo ator e deduplicar contra resultados já pesquisados. A pesquisa do Maps não deve substituir a cobertura Overture nem misturar silenciosamente identidade de fontes diferentes.

## Evidência e revisão

- Nome e categoria vindos do Maps são pistas publicadas, não comprovação da atividade atual. Identidade ambígua permanece para revisão humana.
- Telefone publicado pelo Maps é telefone publicado; não significa que seja WhatsApp. Nunca montar ou presumir um link `wa.me` a partir dele.
- Instagram só deve ser incluído quando a fonte retornar um perfil identificável; não inventar handle nem URL.
- Preservar foto e link direto do Maps quando forem fornecidos. Não criar imagem artificial de empresa como se fosse oficial.
- Não descartar automaticamente um negócio por ter menos de 20 avaliações. Avaliações podem ser mostradas como sinal; a regra não prova porte, capacidade de compra ou legitimidade.
- O Darwin pode organizar, pontuar e preparar rascunhos com base no guia de abordagem versionado. Não envia mensagens nem move candidatos ao funil sem ação da equipe.
- Se uma fonte falhar, explicar isso e manter os resultados válidos já encontrados. Nunca inventar candidatos para preencher a quantidade.

## Entrega

Mostrar a quantidade solicitada e a quantidade efetivamente aprovada, identificando lacunas. Manter origem e evidências ligadas a cada candidato. Ao encaminhar um candidato ao funil, exigir a ação do usuário e preservar a ficha revisada.
