# Verificação das correções de pesquisa e contatos

## Alterações

- Salvar uma abordagem conserva a pesquisa, os filtros e a posição da página. O resultado permanece identificado como trabalhado, com abertura explícita do registro no CRM. O caso de registro já existente segue o mesmo fluxo.
- A normalização rejeita nomes que são apenas categorias, separa classificações claramente incompatíveis e não atribui uma identidade a outro ponto somente por proximidade.
- A leitura de JSON-LD seleciona a entidade correspondente ao nome, segmento e endereço. Não mistura telefones/redes de várias organizações ou da agência autora do site. O cache distingue nome, endereço e categoria. Uma identidade física contraditória não entra na lista; falta de telefone não exclui uma empresa.
- O telefone atual publicado por uma entidade oficial correspondente substitui o número divergente da base. A interface só identifica o telefone como verificado quando essa correspondência existe.
- Pesquisa, CRM e gravação de novos leads usam os mesmos validadores de telefone e WhatsApp. Telefone comum não gera WhatsApp por inferência. Links malformados e códigos curtos sem destino confirmado não ficam acionáveis. Telefones brasileiros de serviço continuam disponíveis para ligação.
- A busca no Google Maps conserva o nome da empresa mesmo quando o endereço não foi informado.

## Evidências

- Regressões de identidade, seleção de entidade, telefone, links e fontes: falharam antes das correções correspondentes.
- Sete arquivos unitários direcionados: **180 passaram, 4 testes de fonte ao vivo ignorados**.
- Navegação/posição no navegador: **5 passaram**, cobrindo desktop e celular, meio e fim da lista e duplicidade.
- TypeScript e ESLint: passaram.
- Revisão independente: os três achados finais (marca curta, chave de cache por segmento, telefones de serviço) foram corrigidos; revalidação de contatos/enriquecimento: **86 passaram**.
- Suíte completa executada durante a integração: **647 passaram, 62 falharam, 4 pendentes**. 61 falhas decorrem de colunas ausentes no schema isolado `atelier_test` (`Lead.meetingAt` e `Goal.proposalsSentTarget`) nos arquivos daily-reports, lead-repository, lead-routes, lead-sale-concurrency, metric-imports, metrics, reports e search-route. A outra falha é a asserção preexistente `keeps the mobile funnel inside a bounded vertical scrollport` em kanban-board.test.ts. Os testes específicos adicionados posteriormente foram executados na verificação direcionada final.
- Suíte de controles comerciais do navegador: **17 passaram, 1 ignorado, 2 falharam**. As falhas preexistentes desktop/celular em `catalog edits, validation, archival and delay preserve drafts` aguardam o campo antigo `Nome do serviço`; as correções atuais não modificam o catálogo.

## Limites observáveis

- A origem dos prospectos continua sendo Overture; OSM resolve limites geográficos. Um link de busca no Google Maps não equivale a um Place ID verificado.
- Formato válido e publicação de um WhatsApp não comprovam que a conta continua registrada/ativa. A interface declara essa condição e não apresenta inferência de telefone como confirmação de WhatsApp. Não foram enviadas mensagens para testar contas.
- Nenhum schema ou dado de produção foi alterado por estas correções. Testes com banco usam o schema isolado `atelier_test`.

Referências: [URLs do Google Maps](https://developers.google.com/maps/documentation/urls/get-started), [Clique para conversar do WhatsApp](https://faq.whatsapp.com/5913398998672934), [Códigos não geográficos da Anatel](https://www.gov.br/anatel/pt-br/regulado/numeracao/codigos-nacionais/codigos-nao-geograficos).
