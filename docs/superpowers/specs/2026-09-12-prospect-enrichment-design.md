# Enriquecimento de prospects por fontes públicas

## Objetivo

Transformar a pesquisa do Atelier Approach em uma fila acionável. Para cada empresa obtida pelo OpenStreetMap, o sistema deve preservar os dados originais e, quando houver um site oficial público cadastrado, complementar contatos publicados pela própria empresa. O resultado deve permitir abrir WhatsApp, Instagram e site diretamente da lista, além de priorizar empresas com canais de abordagem utilizáveis.

## Escopo da primeira versão

- O OpenStreetMap permanece a fonte de descoberta de empresas e de URLs oficiais já cadastradas.
- O servidor pode consultar somente a página inicial do site oficial informado no OSM, usando timeout curto, limite de tamanho e cache.
- A extração procura links `wa.me`, `api.whatsapp.com`, `instagram.com`, `tel:`, e-mail, URL canônica e metadados Open Graph (`og:image`).
- Dados vindos do OSM prevalecem; valores ausentes podem ser completados com dados encontrados no site oficial.
- O sistema não pesquisa Google Maps, não raspa resultados de buscadores e não tenta acessar áreas privadas, logadas ou protegidas de Instagram/WhatsApp.
- Cada link é normalizado e exibido apenas se puder ser aberto de forma segura: `https`, `http`, `tel` ou `https://wa.me`.

## Priorização

O score continua explicável e passa a priorizar capacidade de abordagem:

1. WhatsApp válido e clicável.
2. Telefone clicável.
3. Instagram e/ou site clicável.
4. Empresas sem canal de contato público.

Dentro do mesmo grupo, mantém-se o score atual e o nome em ordem alfabética. A interface mostra uma indicação clara da origem do dado quando ele foi enriquecido pelo site oficial.

## Interface

Os cards de pesquisa exibem ações compactas no topo:

- `WhatsApp` abre uma conversa pelo link público disponível.
- `Ligar` usa `tel:`.
- `Instagram` abre o perfil público em nova aba.
- `Site` abre o endereço oficial em nova aba.
- Uma imagem Open Graph pode aparecer como capa quando a URL for pública e segura; sem imagem, o card mantém o visual atual.

Os cards sem ação aparecem após os cards acionáveis, sem ocultar empresas que ainda podem ser úteis.

## Limites, privacidade e confiabilidade

- Uma consulta por domínio por janela de cache; buscas não devem gerar várias visitas ao mesmo site.
- Timeout de 5 segundos, resposta limitada a 1 MB e falhas silenciosas por empresa: uma página indisponível não derruba a pesquisa inteira.
- Não se armazena conteúdo bruto da página, apenas campos normalizados e a data de sincronização.
- URLs são validadas antes de serem apresentadas para evitar esquemas perigosos ou redirecionamentos internos.

## Modelo e fluxo

1. A pesquisa OSM retorna empresas.
2. Empresas com site oficial passam por enriquecimento em paralelo limitado.
3. O servidor combina dados OSM e dados públicos extraídos, calcula prioridade e devolve resultados.
4. O usuário abre os canais clicáveis ou move o prospect ao CRM.
5. O CRM salva os contatos enriquecidos no momento da abordagem para preservar o contexto comercial.

## Testes

- Unidades para normalização de links, extração de HTML, precedência OSM e segurança de URL.
- Unidades para ordenação de prioridade e cache/timeout do enriquecimento.
- Fluxo ponta a ponta com site simulado: pesquisar, visualizar ações clicáveis, salvar no CRM e conferir a persistência dos contatos.
