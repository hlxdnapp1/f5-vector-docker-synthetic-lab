# EXATA R7A-G1 — Candidata LIMPA de publicação manual, SEM merge/execução

Data: 16/11/2026. Governança: [EXATA #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). Repositório público isolado: `hlxdnapp1/f5-vector-docker-synthetic-lab`.

## 1. Razão para separar esta candidata do PR #26

- [PR Draft #26](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/26), `review/r7a-hosted-docker-real-preflight-draft-20261116`, commit `a76ca00c26354f119c50a289fa2816a22d2ae937`, tem base R6Z `9d9d69a626c3b920f663d2522992f22f0c68765f`. Sua ancestralidade inclui etapas anteriores de revisão offline. **Não direcionar ou mesclar o PR #26 diretamente na `main`**, pois isto incorporaria histórico não homologado para publicação.
- Este PR R7A-G1 nasceu **diretamente da `main` exata `72775463905e9f81730f8f8bb5e5c054f136e6ff`**, sem herdar a cadeia R6F–R6Z. Diferença intencional: apenas workflow R7A de pré-verificação **somente leitura**, script Bash correspondente, sete testes Node estáticos, esta documentação e menor ajuste da linha descritiva README.
- Nenhum arquivo R6F, R6G, fixtures ou código de política offline é necessário para o G0 read-only. O workflow usa `find .github/workflows -type f | wc -l == 1` e recusa dependência de `r6f-offline-review-manual.yml`.

## 2. Autorização e alcance

O proprietário autorizou **continuar a preparação/revisão**, NÃO autoriza merge, dispatch, criação de containers, download de imagens, sessão Docker real, atualização Windows ou HML.

O workflow `.github/workflows/r7a-hosted-real-docker-readonly.yml` possui:
- **Somente `workflow_dispatch`**, jamais push/PR/schedule; `scope` default `DENY` e opção única ativa `HOST_READONLY_ONLY`.
- Repo, visibilidade pública e branch `main` verificados nos campos GitHub e no bash; SHA revisado fornecido manualmente pelo operador exigido igual ao `GITHUB_SHA` exato que executa.
- `runs-on: ubuntu-24.04` runner **padrão GitHub-hosted**, `timeout-minutes: 8`, sem `self-hosted` ou `ubuntu-slim`, nenhuma credencial externa, `permissions: contents: read`; `checkout` fixado por commit com `persist-credentials: false`.
- Guardas pré-checkout, conferência de exatamente um workflow e testes estáticos, seguidos de script G0. O script exige Docker contexto `default` com endpoint `unix:///var/run/docker.sock`, `DOCKER_HOST/CONTEXT/CONFIG` ausentes, Linux amd64, recursos mínimos, e nenhuma fixture R7A preexistente.
- **Comandos Docker somente leitura:** `context show/inspect`, `info --format`, `version --format`, `ps --all --filter ... --format`. Nenhum `pull`, `run`, `create`, `start`, `stop`, `exec`, `logs`, acesso ao servidor Windows ou exposição pública de API Docker.
- Saída pública deliberadamente mínima, sem lista de nomes de containers, variáveis privadas, certificados nem dados de clientes. **Um PASS futuro do G0 só comprovará leitura do daemon do runner, não execução do Vector.**

## 3. Quais evidências ainda não existem

- Ainda **NÃO** foi aprovado adicionar arquivo de workflow à `main`; não foi acionado `workflow_dispatch`. A API do laboratório informou zero runs até a última verificação. O `main` não recebeu código deste PR.
- O R7A-G1 NÃO implementa Vector 0.53.0 real, gateway mTLS, listener HTTPS, Docker `follow=true`, filtros de evento/log de múltiplos projetos, sandbox de containers, cleanup ou rollback. Não confundir R6R offline 271/271 PASS com esse trabalho.
- Testes do **candidato limpo** precisam ser avaliados por sua sintaxe/estática, blob hash e diff independentes; resultados do PR #26 são apenas evidência da referência de origem, não podem ser automaticamente copiados para a candidata.
- Imagem Vector R6X: tag local `0.53.0-alpine` Linux/amd64, índice público coincidente; ID da config local `sha256:ca92d617e905953c3f852e7e88061f7039460e733522e3f0c21bc6ae946b2558`. Isto não prova o binário ou conectividade real.

## 4. Controle de autorização de operadores antes do merge

**Atenção:** `scope=DENY` por padrão e `reviewed_commit` são barreiras de erro operacional, **não são autenticação nem autorização criptográfica**. O SHA de commit é público e qualquer pessoa com permissão de escrita no repositório pode selecionar `HOST_READONLY_ONLY` e copiar o SHA. Nunca afirmar que a mera entrada do workflow comprova aprovação explícita do proprietário.

Antes de qualquer G0B/G0C, revisar as permissões reais de escrita/Actions do repositório e configurar uma proteção verificável de execução, como **GitHub Actions Environment com revisores obrigatórios e proteção de branch**, confirmando previamente que ela existe e está efetivamente configurada; declarar `environment:` no YAML sem configurar a proteção **não** é evidência suficiente. Requer alteração e aprovação de governança próprias. Enquanto isso, não publicar ou despachar o workflow. Conferir também a visibilidade pública e a classe padrão do runner na data do acionamento.

**Resultado da verificação por conector nesta etapa:** a consulta GitHub da proteção da `main` retornou HTTP 403 (`Resource not accessible by integration`); as consultas de configuração de Actions e Environments não foram permitidas pela interface disponível. **Permissões de execução, revisores obrigatórios e proteção da branch permanecem UNVERIFIED/BLOCKED.** Não interpretar 403 como ausência de proteção e não habilitar nada por tentativa.

## 4. Próximos gates separados (NÃO liberados por esta entrega)

1. **G0A, revisão estática:** revisão de dados publicados em PR Draft diretamente para `main`, limites do workflow, testes de sintaxe, hashes e branch. Se divergirem: FAIL/BLOCKED.
2. **G0B, autorização explícita de publicação:** só o proprietário pode autorizar incorporar **este PR mínimo** à `main` pública (ou equivalente revisado), ciente de que um workflow manual estará disponível. Não publicar automaticamente neste passo.
3. **G0C, autorização explícita de execução:** confirmar runner padrão/public, limites de custo, exato `GITHUB_SHA` de `main` após publicação, `scope=HOST_READONLY_ONLY`; só então realizar uma consulta Docker REAL somente leitura no runner. Adicionar/mesclar NÃO significa automaticamente autorizar execução.
4. **G1/G2, outro PR técnico e autorização própria:** broker *deny-by-default* com mTLS e allowlist GET/projeto, Vector v0.53.0 binário digest-pinned, streaming contínuo e ledger/rollback para fixtures em VM efêmera. Bloqueado até testes e autorização para operações Docker realmente mutantes.
5. **HML/Produção:** continuam NO-GO. Os dois Vector originais seguem contidos; última saúde observada dos oito serviços protegidos foi R6W. Não habilitar HTTP2375 no Windows, não reiniciar Supabase, Docker Desktop ou serviços.

Fontes: [GitHub Docs — workflows manuais](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow), [runner público padrão gratuito](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job), [Docker socket security](https://docs.docker.com/engine/security/protect-access/).

## 5. Estado obrigatório

**PR Draft somente.** `MERGE=NOT_AUTHORIZED`; `GITHUB_ACTIONS=NOT_RUN`; `REAL_DOCKER=NOT_TOUCHED`; `VECTOR_BINARY=NOT_EXECUTED`; `GATEWAY_MTLS=NOT_IMPLEMENTED`; `EXATA_HML_PRODUCTION=NO_GO`. A análise não altera o servidor do proprietário.
