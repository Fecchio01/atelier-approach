# Teste isolado de telefone via Maps-to-Lead

## Objetivo

Adicionar uma fonte experimental para procurar telefone/WhatsApp de uma empresa selecionada, sem trocar nem interferir na descoberta geográfica atual. OSM continua resolvendo a localidade e Overture continua fornecendo os resultados e alimentando os gráficos. A nova fonte é apenas uma tentativa de enriquecimento por empresa.

Critério de sucesso: para uma empresa de pesquisa, a pessoa usuária consegue solicitar a verificação, ver um número apenas quando o resultado do Maps corresponde com segurança ao nome e à localização da empresa e entender claramente que a disponibilidade de WhatsApp não foi confirmada. Ausência ou ambiguidade nunca deve introduzir um telefone no CRM.

## Contexto e restrições observadas

- O endpoint atual `/api/search` usa OSM para resolver limites geográficos e Overture para os registros de empresas; a implementação nova não altera esse fluxo.
- O enriquecimento existente valida identidade por site oficial e remove números não validados. O resultado do novo provedor não deve sobrescrever esses dados.
- O teste exploratório de `jhowbhz/maps-to-lead` retornou 17 empresas para uma busca por estética automotiva em Campina do Monte Alegre/SP, mas nenhuma era daquela cidade. O provedor também classificou celulares como WhatsApp sem verificação explícita. Portanto, os resultados do provedor não podem ser aceitos em lote nem tratados como verdade.
- O projeto externo usa Chromium, tarefas assíncronas e SQLite local. Um disco local de contêiner Vercel não é armazenamento durável. O sistema principal não pode depender de arquivos SQLite do provedor.
- O usuário quer manter o deploy do sistema no Vercel. O serviço de verificação deve ser isolado e não pode alterar configurações de framework/roteamento da aplicação principal silenciosamente. Se a conta/projeto não tiver a capacidade necessária para publicar o serviço isolado, não se deve substituir o deploy principal; registrar o bloqueio e solicitar a configuração mínima necessária.

## Abordagens consideradas

1. Acionar automaticamente a API para todas as empresas e gravar números nos resultados. Rejeitada: o teste revelou resultados de outras cidades e não há confirmação de WhatsApp; o risco de associação incorreta é alto.
2. Usar a API apenas sob demanda, com correspondência estrita, e manter Overture/OSM como fonte de empresas. Recomendada: limita escopo, permite comparar a qualidade real e mantém o funil e os gráficos inalterados.
3. Trocar a busca inteira para Maps-to-Lead. Rejeitada: mudaria cobertura geográfica, métricas e critérios de descoberta, contrariando a solicitação.

## Experiência e fluxo

1. Cada card de empresa pesquisada oferece uma ação explícita, “Testar telefone no Maps”.
2. A aplicação envia ao serviço apenas nome da empresa, cidade, estado e, quando disponível, endereço. Não envia a lista toda nem aciona a consulta automaticamente.
3. O serviço faz uma consulta limitada à empresa solicitada e retorna candidatos; não persiste a resposta em SQLite nem em armazenamento próprio.
4. A aplicação compara nome normalizado e elementos de localização (cidade/UF e endereço quando disponíveis) contra o registro aberto.
5. Só um candidato único que passe os critérios estritos pode ser exibido como “Telefone encontrado — conferir”. Múltiplos candidatos, cidade diferente, identidade insuficiente, timeout ou erro resultam em “Não foi possível confirmar telefone”.
6. O número encontrado fica disponível somente na sessão/resultados de pesquisa para inspeção e link de ligação/WhatsApp. Não é gravado na empresa do CRM, não atualiza relatórios/metas e não é apresentado como WhatsApp confirmado. O botão/link externo, se oferecido, deve ser rotulado como tentativa de abrir WhatsApp e não como confirmação de conta.
7. Número oficial já validado pelo enriquecimento atual tem precedência e não é sobrescrito. A tela diferencia “telefone oficial verificado” do retorno experimental.

## Arquitetura e fronteiras

- Adicionar um adaptador de enriquecimento experimental, separado dos clientes OSM/Overture e do enriquecimento oficial atual.
- A UI chama uma rota protegida do próprio Next.js; essa rota valida sessão, normaliza campos, aplica limite de tempo e chama uma URL de serviço definida por variável secreta de ambiente. Credenciais do provedor nunca chegam ao navegador.
- Hospedar o scraper como serviço/container isolado, de preferência no mesmo ambiente Vercel apenas se o projeto tiver acesso e suporte confirmados. Adaptá-lo para uma requisição HTTP limitada e stateless, sem depender do gerenciador assíncrono ou SQLite. A aplicação principal e o deploy existente permanecem intactos.
- Se não for possível ativar um serviço isolado no projeto Vercel atual sem reconfiguração de framework ou alteração arriscada, concluir a integração local/testável, não trocar o deploy principal e pedir apenas a configuração do serviço isolado.
- A API de teste não recebe webhook de lote e não pode alimentar automaticamente o funil.

## Correspondência e segurança de dados

- A verificação exige nome não vazio e cidade/UF conhecidos.
- Rejeitar resultado com cidade/UF divergentes.
- Normalizar acentos, pontuação, sufixos societários comuns e espaços para comparar nomes, mantendo os valores originais para exibição.
- Exigir semelhança forte de nome e, quando o registro tiver endereço, consistência do endereço. Se a pontuação não superar o limiar definido e coberto por casos de teste, retornar sem telefone.
- Se houver mais de um candidato plausível, retornar ambiguidade e não escolher automaticamente.
- Normalizar telefone para E.164 apenas quando país/DDD estiverem claros. Não inferir WhatsApp por ser celular.
- Não registrar número bruto em logs. Aplicar limite de requisições por usuário/empresa e timeout curto; nunca iniciar uma busca ampla sem limite.

## Falhas e estados da interface

Estados explícitos: disponível para testar, consultando, número encontrado mas não verificado, sem correspondência confiável, ambíguo e provedor indisponível. A falha desta função não bloqueia a pesquisa normal e não muda os cards existentes.

## Verificação

- Testes unitários para normalização, correspondência de nomes/localização, ambiguidade e precedência de número oficial.
- Testes da rota para sessão ausente, validação de entrada, timeout, indisponibilidade do serviço, nenhum resultado, múltiplos resultados e número candidato único.
- Teste de regressão confirmando que `/api/search`, OSM, Overture, gráficos e gravação no CRM permanecem inalterados.
- Smoke test em desenvolvimento com resposta mockada antes de qualquer chamada real; depois, uma consulta manual explicitamente acionada e limitada.
- Build e lint/testes do projeto antes do commit da implementação.

## Fora de escopo

- Substituir OSM ou Overture, alterar a busca por nicho/localização ou seus limites.
- Preencher/atualizar números automaticamente em lote.
- Confirmar existência de conta WhatsApp sem uma fonte capaz de verificar isso.
- Persistir novos números no CRM, relatórios, metas ou banco de dados.
- Criar alarmes, cron, notificações externas ou coleta automática recorrente.

## Decisões aprovadas

- Manter OSM e Overture para busca, localidade e métricas.
- Usar Maps-to-Lead como fonte experimental separada para telefone.
- Consultar sob demanda e não integrar números ao CRM enquanto não houver validação.
- Não arriscar a implantação atual do Vercel para habilitar o serviço; isolamento e suporte devem ser verificados.
