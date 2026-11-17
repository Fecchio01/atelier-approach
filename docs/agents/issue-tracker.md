# Issue tracker: GitHub

Issues e especificações deste repositório ficam no GitHub Issues de `Fecchio01/atelier-approach`. Use `gh` para todas as operações. PRs não são pedidos de triagem.

## Convenções

- **Criar issue**: `gh issue create --repo Fecchio01/atelier-approach --title "..." --body "..."`. Para corpos multilinha, use um arquivo ou heredoc.
- **Ler issue**: `gh issue view <n> --repo Fecchio01/atelier-approach --json number,title,body,labels,comments`.
- **Listar issues**: `gh issue list --repo Fecchio01/atelier-approach --state open --json number,title,body,labels,comments`, acrescentando filtros `--label` e `--state` conforme necessário.
- **Vincular sub-issue**: crie com `gh issue create --parent <pai> ...` ou vincule depois com `gh issue edit <pai> --add-sub-issue <filho>` (gh 2.94+). Se sub-issues não estiverem disponíveis, inclua `Part of #<pai>` no início do corpo da filha.
- **Declarar bloqueios**: prefira dependências nativas do GitHub: `gh issue create --blocked-by <n>,<n> ...` ou `gh issue edit <filha> --add-blocked-by <bloqueador>` (gh 2.94+). Se indisponíveis, inclua `Blocked by: #<n>, #<n>` no início do corpo da filha. Uma issue está desbloqueada quando todos os bloqueadores estão fechados.
- **Contar bloqueadores abertos**: `gh api repos/Fecchio01/atelier-approach/issues/<n> --jq .issue_dependencies_summary.blocked_by`. Alternativa: `gh issue view <n> --repo Fecchio01/atelier-approach --json blockedBy --jq '[.blockedBy.nodes[] | select(.state == "OPEN")] | length'`.
- **Comentar**: `gh issue comment <n> --repo Fecchio01/atelier-approach --body "..."`.
- **Aplicar/remover labels**: `gh issue edit <n> --repo Fecchio01/atelier-approach --add-label "..."` / `--remove-label "..."`.
- **Fechar**: publique a explicação com `gh issue comment <n> --repo Fecchio01/atelier-approach --body "..."` e feche com `gh issue close <n> --repo Fecchio01/atelier-approach`.

Determine o repositório pelo remote Git (`git remote -v`); dentro do clone, `gh` também infere o repo. Registre issues somente em `Fecchio01/atelier-approach`; nunca em `mattpocock/skills`, origem destas skills.

Quando uma skill disser para publicar uma especificação no issue tracker, crie uma GitHub Issue neste repositório.

## Wayfinder

Para `/wayfinder`, o mapa é uma issue única com label `wayfinder:map` e conteúdo de Notas, Decisões até agora e Incertezas. Os tickets são issues filhas vinculadas ao mapa como sub-issues, com labels `wayfinder:<tipo>` (`research`, `prototype`, `grilling` ou `task`). Use dependências nativas do GitHub para bloqueios quando disponíveis; consulte as convenções acima. Sem suporte a sub-issues, use uma lista de tarefas no mapa e `Part of #<map>` no ticket.
