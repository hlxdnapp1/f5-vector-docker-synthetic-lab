# EXATA R24-03W — R7A: workflow MANUAL para pré-verificação Docker REAL em runner público

**Data:** 16/11/2026. **Governança:** [EXATA #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). Repositório **PÚBLICO**, exclusivamente sintético, `hlxdnapp1/f5-vector-docker-synthetic-lab`. Branch-base do trabalho anterior `review/r6z-hyperv-host-preflight-readonly-20261116`, commit imutável `9d9d69a626c3b920f663d2522992f22f0c68765f` ([R6Z Draft #25](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/25)); `main` de LAB ainda `72775463905e9f81730f8f8bb5e5c054f136e6ff`.

## 1. Autorização recebida: APENAS PREPARAR EM PR DRAFT

O proprietário disse **"sim"** à proposta específica de **preparar um workflow Docker real no laboratório público existente, em uma nova branch isolada e PR Draft, sem execução, sem merge e sem alterações no Windows EXATA**. Isto **NÃO** autoriza incorporar na `main`, despachar GitHub Actions, cobrar runner extra, criar containers, baixar imagens, executar Vector ou implementar gateway com acesso ao Docker. No servidor Windows Server 2025 Standard Evaluation, R6Z demonstrou somente 2,11 GiB de RAM disponíveis e C: 44,15 GiB livres: VM local não é recomendada agora. O classificador `BLOCKED_WINDOWS_EDITION` do R6Z era restrito indevidamente ao Windows cliente; Windows Server 2025 possui função Hyper-V, mas recursos disponíveis e estado do Hyper-V não são suficientes para o plano. **Não executar o R6Z novamente.**

O Codex já havia estudado a alternativa GitHub Actions público [EXATA PR #331/R6B](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/pull/331). Confirmado GitHub: o repositório público de laboratório **já existe**, não precisa criar outro; runners GitHub-hosted `ubuntu-24.04` padrão são VMs efêmeras gratuitas para repositórios públicos. **Não usar `ubuntu-slim`, `self-hosted` ou runners maiores.**

## 2. Conteúdo R7A e escopo real

- Novo workflow `.github/workflows/r7a-hosted-real-docker-readonly.yml`: único gatilho `workflow_dispatch` **manual**, entrada `scope` default `DENY`, exige escolha `HOST_READONLY_ONLY`, entrada de `reviewed_commit` igual ao SHA do job, `github.repository` restrito, somente `refs/heads/main`, repositório `public`, `ubuntu-24.04`, timeout 8 minutos, concurrency 1, `permissions: contents: read`, `actions/checkout` pinado por SHA com `persist-credentials: false`.
- Novo script `scripts/R7A-HOSTED-DOCKER-READONLY-PREFLIGHT.sh`: recusa quaisquer variáveis `DOCKER_HOST`, `DOCKER_CONTEXT`, `DOCKER_CONFIG`, `DOCKER_TLS_VERIFY`, `DOCKER_CERT_PATH`, `DOCKER_API_VERSION`; exige runner GH-hosted Linux x64 Ubuntu 24.04, contexto default, endpoint **Unix local** `unix:///var/run/docker.sock`, Docker Engine Linux, arquitetura amd64/x86_64, recursos mínimos e nenhuma fixture com label `R7A_ONLY` preexistente. Usa só comandos de leitura: `docker context show/inspect`, `docker info`, `docker version` e `docker ps --all --filter`. **NUNCA** imprime inventário de nomes de containers ou info bruto.
- Novo `tests/r7a-hosted-docker-readonly-workflow.test.mjs`: sete testes Node **ESTÁTICOS**, validador de gatilhos, permissões, runner, commit, ausência de métodos de mutação e preservação do workflow antigo.
- Menor alteração do workflow R6F existente: substitui a contagem esperada `1` por `2`, exigindo os **dois nomes exatos** de workflow. Mantém TODO o job antigo offline, com `node --test` e `DOCKER_REAL=NOT_USED`; nenhuma operação Docker foi adicionada ao R6F.
- Esta documentação.

## 3. Cuidado: nome do workflow não é prova de integração real

A **única** atividade futura que o workflow R7A conseguiria fazer, **depois** de duas autorizações separadas (merge e dispatch), seria **G0 — inspecionar por leitura o Docker Engine real da VM GitHub-hosted**. Um G0 PASS só demonstraria contexto Docker local na VM hospedada; **não demonstra execução do Vector, mTLS, container sintético nem streaming `follow=true`**.

**G1/G2 estão intencionalmente AUSENTES/NO-GO.** Não há código publicado no R7A capaz de baixar imagem ou criar fixtures, nem de executar o binário Vector, gerar CA/certificado mTLS ou conectar broker a um daemon. O código offline R6F/R6G ainda usa `follow=false` e resposta limitada; não pode ser promovido como gateway real. Não criar um proxy Docker irrestrito: até com mTLS, certificado de cliente normalmente concede acesso com poder equivalente a root no daemon. Testar apenas via broker *deny-by-default* com identidade de projeto e respostas sanitizadas, em PR futuro com revisão e rollback.

## 4. Gates de liberação (nenhum autorizado por esta entrega)

| Gate | Condição | Situação |
| --- | --- | --- |
| R7A-G0A | CI **estático local**, YAML/bash/testes completos, Git blobs SHA | **PASS LOCAL**: Node 7/7, Bash parse, YAML 2/2, falha segura 4/4; GitHub Actions não executado |
| R7A-G0B | Autorizar **merge limitado** do workflow e scripts ao `main` público | **BLOQUEADO: aprovação separada** |
| R7A-G0C | Autorizar **primeiro `workflow_dispatch` manual** com SHA exato, custo/visibilidade conferidos | **BLOQUEADO: aprovação separada** |
| R7A-G0D | G0 somente leitura Docker Engine Unix local no runner | **NOT_RUN** |
| R7B-G1 | Prova do binário real Vector `0.53.0-alpine`, digest verificado, fixtures segregadas com ledger/rollback, controle de CPU/RAM | **NOT_IMPLEMENTED / NO-GO** |
| R7C-G2 | Broker mTLS, GET filtrados por projeto, stream `follow=true`, EVENTS/INSPECT/log mux, timeouts, política de cancelamento | **NOT_IMPLEMENTED / NO-GO** |
| HML | Backup/rollback reais 8/8, alteração **somente** dos Vector, janela aprovada | **NO-GO** |
| Produção | Aprovação fiscal/operacional adicional | **NO-GO** |

**Nota sobre o gatilho:** GitHub exige que o arquivo `workflow_dispatch` esteja na **branch padrão** para ser despachado. Estar apenas neste PR Draft **não executa o job**. Ver [GitHub Docs — manual workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

**Nota sobre custo:** runner padrão em repo público é gratuito segundo [GitHub Docs — runner selection](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job). Caso a visibilidade mude, **não executar** até revalidar preços, quotas e cobrança. Não adicionar artifacts, caches, armazenamento externo ou runners pagos.

## 5. Evidência anterior preservada

- R6R 271/271 Node Windows **PASS offline**, sem Docker real; R6S–R6U PASS read-only; R6W 8/8 protegidos healthy em observação; R6X tag/digest público `0.53.0-alpine` `linux/amd64` e config image ID `sha256:ca92d617e905953c3f852e7e88061f7039460e733522e3f0c21bc6ae946b2558`. A versão executável nunca foi atestada, e os dois Vector locais continuam contidos.
- Código Supabase CLI `v2.117.0`, commit `21db855916f2c2b12f61cde923a27094b8528b23`, gera `DOCKER_HOST=http://host.docker.internal:2375` no Windows npipe; esta conexão continua insegura e não deve ser habilitada no servidor.
- **R7A não reproduz R6R** nem tenta atualizar Supabase, Docker Desktop, Windows Server, Hyper-V, banco, fiscal, HML ou produção.

**Evidência da revisão local (sem runner):** cópias exatas dos 4 arquivos executáveis/controle foram confrontadas com os Git blobs: script `265e6ff23f6c6d2476f0e741c17268ac991770b1`, YAML novo `d834078955ef1f025a042abec95de96a4311cca3`, teste `c51e5126e483a6424cb4cb007846c2bfb264540c`, workflow offline anterior minimamente ajustado `6fd1b3e63e18a56305a56d2ca41febf535c41874`. Resultado local Node `7/7 PASS` (`ExitCode=0`); `bash -n` `PASS`; ambos os YAML analisados (`2/2`); quatro testes negativos (`EVENT_NOT_MANUAL`, `WRONG_REPO`, `COMMIT_NOT_MATCHING_REVIEWED`, `DOCKER_ENV_OVERRIDE_PRESENT`) encerraram com código 1 conforme esperado. Estes testes **não são** GitHub Actions ou prova do Docker Engine real. A suíte histórica completa R6R `271/271` não foi repetida.

**Conclusão:** R7A = **PR Draft com candidato de preflight Docker real somente leitura**, sem teste real ainda, sem execução/merge. Preparação técnica incremental concluída somente após checagem de integridade e testes estáticos; recuperação do Vector continua **BLOCKED**.
