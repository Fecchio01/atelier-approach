# Funil persistente e listas limitadas — especificação de design

## Objetivo

Fazer com que a equipe consiga confiar que empresas adicionadas e movidas no CRM continuarão na etapa correta depois de abrir outro aplicativo, navegar para outra área ou recarregar o site. Ao mesmo tempo, uma etapa cheia não deve empurrar “Outras situações” e a Lixeira indefinidamente para baixo.

## Estado atual

O CRM já grava empresas em PostgreSQL: a inclusão cria o lead e seu histórico inicial em transação; mover de etapa persiste a nova etapa e o registro de histórico em transação; descartar mantém a empresa e o histórico na Lixeira. A página lê os registros do banco. A ação “Devolver para pesquisa” é diferente: ela apaga o lead e o histórico deliberadamente, mediante confirmação.

O quadro atualmente renderiza todos os cards de cada etapa em uma lista vertical sem altura máxima. Portanto, o tamanho da página cresce junto com a quantidade de leads. Há testes de retorno à página e de inclusão em lotes, e de movimentação de etapa; falta uma cobertura E2E que prove a sequência completa de sete empresas mais três, mudança de etapa, saída/retorno e recarga do documento.

## Comportamento e limites

- O banco é a fonte de verdade; a interface não deve tratar uma atualização otimista como concluída antes da resposta bem-sucedida da API.
- Após criar leads, alterar etapas ou descartar, os dados devem sobreviver à navegação entre rotas e à recarga completa. Ao retornar de uma página suspensa/app externo, a tela refaz a leitura do servidor.
- Uma falha ao salvar deve manter a empresa visível e mostrar erro, sem apresentá-la silenciosamente como persistida.
- Alterações de etapa permanecem atômicas com o histórico. Duplicatas continuam sujeitas à chave única atual e não devem criar leads repetidos.
- “Descartar” preserva lead e histórico na Lixeira; “Devolver para pesquisa” continua sendo a ação explicitamente destrutiva já existente e requer confirmação.

## Quadro e rolagem

- Cada etapa mantém seu cabeçalho, contador e cards atuais, mas a lista de cards recebe altura máxima responsiva e rolagem vertical própria.
- O cabeçalho da etapa permanece visível enquanto a lista interna rola.
- A rolagem da lista é contida para não capturar a página inteira; a rolagem horizontal do quadro no celular continua disponível.
- “Outras situações” e Lixeira ficam fora das listas limitadas e podem ser alcançadas pela rolagem normal da página sem percorrer todos os cards de cada etapa.
- O limite visual se adapta à altura da janela, evitando tanto uma lista quase sem espaço em telas baixas quanto uma coluna excessivamente alta em desktop. Nenhum lead é ocultado ou removido pelo limite: todos continuam acessíveis dentro da respectiva lista.
- Em celulares, validar gestos de rolagem horizontal entre etapas e vertical dentro de uma etapa, foco por teclado e visibilidade/acesso à Lixeira.

## Dados e recuperação

Esta mudança não cria uma segunda cópia no `localStorage` nem um novo banco. Os modelos `Lead`, `Activity` e `StageHistory` existentes permanecem a fonte durável. A API continua responsável por criar e mover registros no servidor; a tela deve revalidar a lista a partir do banco ao retornar de suspensão e em navegação/recarga normal. Nenhum erro de leitura deve ser convertido em uma lista vazia que pareça uma exclusão.

Não se promete persistência depois das ações destrutivas que a interface já oferece com confirmação (devolver para pesquisa). Descartar não é destrutivo e deve manter os registros na Lixeira.

## Validação e aceite

- E2E autenticado inclui sete empresas, acrescenta três, simula saída/retorno de app externo e confirma as dez no banco e na interface.
- O mesmo E2E move uma empresa para outra etapa, navega para fora e volta, recarrega a página e confirma que ela continua na etapa de destino com seu histórico.
- E2E valida que descarte permanece na Lixeira após reload e que devolução para pesquisa só remove após confirmação.
- Testes de falha de API verificam que erro de atualização não deixa a interface afirmar persistência nem remove o lead da tela.
- Testes desktop e mobile comprovam listas internas limitadas, scroll dos cards sem crescimento ilimitado da página, rolagem horizontal do quadro no celular e acesso às seções inferiores.
- Rodar testes CRM/mobile relevantes, typecheck, lint e build de produção.
