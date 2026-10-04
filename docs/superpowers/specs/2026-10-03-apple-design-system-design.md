# Refinamento de interação Apple-inspired — especificação de design

## Objetivo

Aplicar ao Atelier Approach, em desktop e mobile, os princípios do guia Apple Design enviado pelo usuário: resposta imediata, sensação de continuidade, materiais e hierarquia tipográfica deliberados, previsibilidade e acessibilidade. O resultado deve parecer mais direto e fluido sem transformar o produto em uma cópia visual da Apple nem perder a identidade escura e verde do Atelier.

O escopo abrange Painel, Funil/CRM, Empresas/Pesquisa, Metas, Relatórios, Perfil/Configurações e Login, incluindo elementos compartilhados de navegação, formulários, botões, painéis, abas e diálogos. A lógica comercial, os dados, permissões, endpoints, cálculos e fluxos de persistência permanecem inalterados.

## Alternativas consideradas

1. **Refazer visualmente todas as telas para imitar produtos Apple.** Isso mudaria cores, estruturas e padrões já reconhecidos e elevaria o risco de regressão; não recomendado.
2. **Adotar os princípios de interação e acabamento do guia, preservando a marca e os layouts existentes.** Padroniza feedback, hierarquia, superfícies e movimento apenas onde ajudam a orientar o usuário; recomendado.
3. **Aplicar apenas animações genéricas em toda a interface.** É mais rápido, mas não cobre resposta tátil, legibilidade, preferências de acessibilidade nem o uso criterioso de translucidez; não recomendado.

## Experiência proposta

- Preservar fundo escuro, verde Atelier, marca, nomenclatura, composição das páginas e padrões já familiares.
- Revisar a tipografia global para priorizar a fonte nativa do sistema e melhorar tracking, leading e escala de títulos sem ampliar desnecessariamente a densidade das telas.
- Unificar estados de interação de controles: resposta visual imediata ao pressionar, estados de foco/seleção claros e feedback de salvamento, erro e conclusão junto à ação correspondente.
- Usar transições curtas e coerentes para abrir/fechar o menu mobile, diálogos e painéis, começando do valor visual atual quando a interação for revertida. Animar somente propriedades compostáveis como `transform` e `opacity`; não bloquear entrada durante transições.
- Reservar transparência e blur para superfícies flutuantes — cabeçalho mobile, navegação e camadas de diálogo — mantendo conteúdo e formulários em superfícies opacas para legibilidade.
- Não introduzir gestos de arrastar, rolagem horizontal forçada, sons, vibração ou animações contínuas sem necessidade funcional. Não adicionar dependência de movimento se CSS e APIs existentes forem suficientes.

## Acessibilidade e adaptação ao dispositivo

- Respeitar `prefers-reduced-motion`, mantendo resposta visual útil por meio de mudanças de cor/opacidade sem deslocamentos amplos ou efeitos elásticos.
- Respeitar `prefers-reduced-transparency` e `prefers-contrast: more`, substituindo blur por superfícies mais sólidas e aumentando a distinção das bordas quando solicitado.
- Preservar foco visível, navegação por teclado, semântica e alvos de toque confortáveis. O conteúdo deve se adaptar a telas estreitas e orientação diferente sem overflow horizontal.
- Não alterar o comportamento de rolagem de listas, quadro do funil, pesquisa ou relatórios.

## Implementação

O acabamento será centralizado em tokens e estilos globais em `app/globals.css` e nos componentes compartilhados (`components/ui.tsx`, `components/app-shell.tsx`, `components/mobile-navigation.tsx`). Serão ajustados os componentes de interação de alto uso já existentes — incluindo cartões e abas de metas, quadro/modal do CRM, navegação de períodos e controles de relatório, perfil e formulário de pesquisa/login — apenas onde necessário para aplicar os mesmos estados visuais e respeitar preferências de acessibilidade.

As mudanças serão incrementais e sem refatoração de dados ou rotas. O projeto já inclui React, Next.js, Tailwind 4 e Phosphor Icons; não se presume nem se acrescenta uma biblioteca de animação. Se a exploração durante a implementação revelar que uma interação exigiria uma nova dependência ou alteração de arquitetura para ser fiel ao guia, o escopo será revisto antes dessa expansão.

## Validação e publicação

- Revisar em viewport mobile estreita e desktop as sete áreas — Painel, Funil/CRM, Empresas/Pesquisa, Metas, Relatórios, Perfil/Configurações e Login — e os elementos globais, incluindo estados ativo, pressionado, foco, carregamento, erro e confirmação.
- Verificar abertura, fechamento e reversão de diálogos/menu sem travar controles; conferir movimento reduzido, transparência reduzida e contraste aumentado.
- Executar lint, typecheck, testes unitários/E2E relevantes e build de produção, separando regressões preexistentes de falhas introduzidas.
- Preservar mudanças existentes no worktree e excluir caches/artefatos gerados de qualquer commit. Após aprovação e validação, registrar e enviar as alterações ao GitHub no branch atual e publicar a versão no Vercel, verificando o deployment e as páginas principais.

## Fora de escopo

- Alterações em fluxos comerciais, regras de funil, banco, autenticação, metas, relatórios, pesquisa ou API.
- Redesign de marca, troca da paleta do Atelier por cores da Apple ou imitação literal de telas/produtos proprietários.
- Gestos novos, parallax, movimento perpétuo, haptics, áudio, glassmorphism em áreas de conteúdo ou migração para outra biblioteca de interface.
