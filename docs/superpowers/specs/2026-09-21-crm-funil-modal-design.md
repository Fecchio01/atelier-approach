# CRM organizado com funil expandido

## Objetivo

Substituir o quadro atual, que expõe IDs técnicos, histórico e formulários em cada coluna, por um CRM de leitura rápida. A equipe deve conseguir identificar uma empresa e sua etapa sem abrir detalhes; contatos, histórico e ações aparecem somente após selecionar o card.

## Referência visual

Foi gerada uma referência de interface de quadro escuro com acento verde-limão e modal central. Ela confirmou os princípios a aplicar: cards baixos e arejados, sete colunas com cabeçalhos claros, informação progressiva e modal sobre fundo desfocado. A aplicação manterá a navegação superior existente em vez da barra lateral que aparece apenas como composição da referência.

## Sistema visual para toda a aplicação

O mesmo sistema visual será aplicado ao Painel, Pesquisa, Metas, Relatórios e Configurações, sem levar o kanban ou o modal para telas onde eles não ajudam.

- Fundo carvão em camadas, bordas discretas, contraste alto e verde-limão exclusivamente para ação principal, seleção e estado positivo.
- Cabeçalhos das páginas têm título direto, contexto curto e ação primária clara; conteúdo fica dentro de uma largura consistente e respirada.
- Cartões de dados mostram apenas a informação necessária para decidir. Detalhes operacionais ficam em revelação progressiva, não em texto exposto simultaneamente.
- Campos, tabelas, métricas, estados vazios, erros e carregamentos recebem hierarquia e espaçamento consistentes.
- Pesquisa conserva os filtros e dados OSM atuais, mas usa uma área de filtro mais limpa e cards de prospect focados em nome, canais e ação; dados complementares ficam em detalhe expansível/modal.
- Navegação superior ganha indicação de rota ativa e comportamento responsivo, preservando todas as rotas existentes.

## Fluxo do funil

O funil principal passa a ter estas etapas, nesta ordem:

1. Novo
2. Abordado
3. Em conversa
4. Qualificado
5. Proposta enviada
6. Follow-up
7. Ganho

As etapas auxiliares continuam fora do fluxo principal: Sem resposta e Descartado.

Uma abordagem criada pela pesquisa entra em **Abordado**. Métricas existentes continuam tratando Abordado como abordagem, Follow-up como reunião/retorno e Ganho como venda. As novas etapas intermediárias não contam uma conversão nova sozinhas.

## Quadro

- Cada card mostra somente nome, recência da última atividade e marcadores discretos para canais disponíveis (WhatsApp, Instagram, site ou telefone).
- IDs OSM, telefones, endereço, histórico, inputs e botões operacionais não aparecem nas colunas.
- O card inteiro é acionável por mouse e teclado e abre os detalhes.
- O quadro usa rolagem horizontal em telas estreitas e colunas com largura legível; não comprime cards até sobrepor conteúdo.

## Detalhes da empresa

- Abrir um card mostra um modal com fundo desfocado, foco acessível e fechamento por botão, Escape ou clique fora.
- O modal organiza dados em blocos: canais de contato clicáveis, endereço/categoria, histórico de atividades, movimentação de etapa, agendamento de follow-up, registro de contato, fechamento de venda, descarte e devolução à pesquisa.
- Ações atuais permanecem com as mesmas validações e mensagens de erro.
- **Devolver para pesquisa** mantém sua confirmação explícita e apaga o lead e seu histórico, como já definido para registros de teste/cliques acidentais.

## Dados e compatibilidade

- O enum `LeadStage` recebe `IN_CONVERSATION`, `QUALIFIED` e `PROPOSAL`.
- Dados existentes permanecem nas etapas atuais sem migração semântica: NEW, CONTACTED, INTEREST, FOLLOW_UP, WON, NO_RESPONSE e DISCARDED.
- A API aceita as novas etapas pela mesma validação enum já existente. Rótulos e ordenação ficam centralizados para evitar divergência entre CRM e dashboard.

## Testes e aceite

- Testar as novas transições e preservar as validações de fechamento, follow-up e descarte.
- Testar que o quadro não renderiza ID OSM ou dados sensíveis antes de abrir o modal.
- Testar abertura/fechamento do modal e a ação de devolver para pesquisa.
- Rodar suite, lint, typecheck e build; revisar no navegador local em largura desktop e estreita.
