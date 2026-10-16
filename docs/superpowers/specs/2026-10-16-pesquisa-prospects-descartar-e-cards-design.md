# Pesquisa de prospects: descarte, contatos e consistência visual

## Objetivo

Deixar a pesquisa mais confiável e prática: permitir descartar prospect irrelevante de forma persistente, recuperar os contatos que a base já fornece sem inventar WhatsApp, apresentar Instagram válido e fotos públicas associadas à empresa, e padronizar os cards para leitura e ação consistentes.

## Decisões aprovadas

- O descarte pertence ao usuário autenticado e persiste no banco, entre sessões e novas pesquisas. Não cria Lead nem move a empresa para o CRM/lixeira.
- A busca continua vindo do Overture; não reintroduzir uma nova API de telefones nem misturar fontes empresariais.
- Manter um telefone que veio diretamente no registro Overture como telefone de cadastro, sem promovê-lo a WhatsApp. WhatsApp só aparece quando há URL explícita fornecida pela fonte ou quando o site oficial confirmado publica exatamente o mesmo número.
- Links sociais precisam ser normalizados e validados antes de virar ação clicável. Instagram deve apontar para perfil no domínio oficial do Instagram; valor inválido não vira link.
- Foto real só é exibida quando recuperada de página oficial compatível com a identidade da empresa. O fallback atual continua como identidade visual, não como foto.
- Nome exibido deve privilegiar o nome comercial, sem trechos de descrição promocional. Conteúdo variável não pode empurrar a ação principal; links longos devem quebrar dentro do card.
- Cards da mesma grade têm altura uniforme, mídia em espaço fixo, e ação principal alinhada ao rodapé; a grade continua responsiva.

## Persistência e fluxo de descarte

Adicionar um modelo Prisma `ResearchDismissal`, identificado por `ownerId` e `osmId`, com chave única composta e data de criação. A migração cria a tabela, índice único e concede à role `atelier_app` as permissões CRUD, seguindo o padrão das migrações de pesquisa existentes.

Um endpoint autenticado `POST /api/research/dismissals` recebe apenas o identificador Overture, valida o formato e grava idempotentemente o descarte do usuário atual. O card oferece uma ação secundária “Descartar empresa”; só é removido após resposta de sucesso. Em caso de falha, mantém-se visível e a interface informa o erro.

Ao preparar cada página de resultado — incluindo continuação de busca já persistida — a API exclui os identificadores descartados pelo proprietário da sessão. Outros usuários não são afetados. A busca não deve perder candidatos nem alterar ordenação por causa do descarte.

## Dados e apresentação

- Na etapa de enriquecimento, preservar telefone e WhatsApp explicitamente presentes no registro Overture quando não há site a validar. Se o site divergir da empresa/localização, não usar contatos extraídos desse site. Uma divergência confirmada também não deve ser silenciosamente substituída por contato inferido.
- Nunca construir URL `wa.me` a partir de um número de telefone comum.
- Normalizar o Instagram para URL HTTPS de perfil apenas quando o host for `instagram.com`/`www.instagram.com` e o caminho representar um perfil válido; rejeitar outros hosts, protocolos e valores vazios.
- Continuar usando metadados de imagem de site oficial apenas quando o nome da página confirmar a empresa. Sem imagem real verificada, preservar o SVG de identidade como fallback.
- Limitar o nome exibido a nome comercial; aplicar truncamento visual e quebra de links nos detalhes, sem aumentar o card por texto promocional ou URL extensa.
- Remover o subtítulo de categoria do cabeçalho do card, pois o pedido é mostrar o nome da empresa sem descrição de atividade ali.
- A ação de descarte fica visualmente secundária à ação “Marcar como abordada”.

## Falhas e segurança

Todas as mutações e leituras de descarte exigem usuário autenticado e usam `ownerId` obtido da sessão, nunca do corpo da requisição. IDs inválidos retornam 400; não autenticado retorna 401. A UI não remove o card de forma otimista irreversível quando o servidor falha. A migração não altera Leads ou dados existentes.

## Verificação

Adicionar testes unitários para: preservar contato de origem sem site; nunca converter telefone em WhatsApp; rejeitar conflito de identidade; aceitar somente URL válida de perfil Instagram; API autenticada/idempotente/escopada ao usuário; exclusão de prospects descartados tanto na primeira página quanto na continuação; e limpeza do nome de exibição. Atualizar teste E2E para conferir alturas alinhadas, CTA no rodapé, links longos sem overflow, descarte persistente e foto/fallback correto. Rodar lint, typecheck e testes focados, depois a suíte completa/build de produção.

## Fora de escopo

- Importar imagens por busca reversa ou scraping de Google Maps.
- Garantir foto para empresas sem imagem pública associada.
- Exibir como WhatsApp qualquer telefone que não venha como WhatsApp verificável.
- Criar interface de restauração de prospects descartados nesta entrega.
- Alterar fonte de empresas, geocodificação, CRM, metas ou fluxo comercial.
