# EXATA R24-03W R6U — Evidência de origem Supabase CLI versus Compose

**Data:** 16/11/2026. **Governança:** [EXATA #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Repositório isolado:** `hlxdnapp1/f5-vector-docker-synthetic-lab`. **Branch-base R6T:** `review/r6t-vector-configuration-ownership-decision-20261116`, commit exato `425ae77a33e8b3cf8f942f1bf6a6ff7f286c1e59`.

## 1. Resultado R6T no Windows, reportado pelo proprietário

- R6T GitHub / commit / SHA-256 / diff / sintaxe: **PASS**.
- Relatório R6S anterior: **SHA-256 PASS**, origem `91913CF2DF18099390BD4334CB657ABFAB9EFDD4D35F40DB258E6BF4DDB16DCF`; os bytes não foram disponibilizados para revalidação independente fora do Windows.
- Dois Vector `exited` e ambos `HTTP_2375_UNSAFE`, sem socket Unix montado; 8/8 serviços `db`, `analytics`, `studio`, `storage` estavam `running/healthy` no instante R6S.
- Para os dois Vector: `COMPOSE_LABEL=True`, `COMPOSE_CONFIG_FILES_LABEL=False`, `TLS_VERIFY_ENV_PRESENT=False`, `TLS_CERT_PATH_ENV_PRESENT=False`, `NETWORK_CLASS=CUSTOM_OR_UNVERIFIED`, `MOUNTS=0`.
- Reinicializações históricas registradas: **2513** e **2514**. Não identificar uma causa raiz histórica apenas por esse número. R6T foi exclusivamente análise do JSON pré-existente, sem nova consulta ao Docker.

## 2. Descoberta de código oficial: o rótulo Compose sozinho NÃO identifica um Compose autônomo

A versão atual consultada do código do **Supabase CLI** na branch padrão, commit exato `ff05ee97bb4c50a66f2e04ef20675d65e04c1de2`, mostra:

- [`packages/stack/src/runtime/Container.ts`](https://github.com/supabase/cli/blob/ff05ee97bb4c50a66f2e04ef20675d65e04c1de2/packages/stack/src/runtime/Container.ts) — o próprio runtime do Supabase adiciona etiquetas **`com.docker.compose.project`** e **`com.docker.compose.service`** ao criar containers via CLI. A existência dessas etiquetas não prova que `docker compose up` ou um arquivo YAML foram utilizados.
- [`apps/cli/src/commands/start/services/vector.service.ts`](https://github.com/supabase/cli/blob/ff05ee97bb4c50a66f2e04ef20675d65e04c1de2/apps/cli/src/commands/start/services/vector.service.ts) — o planejador `resolveVectorDockerSocketPlan`, para origem `npipe` Windows, usa `DOCKER_HOST=http://host.docker.internal:2375` e sem Unix mount. Esse comportamento coincide com o R6S, mas **não** prova a versão e o modo usados pelos containers do proprietário.
- [`apps/cli/src/command-internal/db-bootstrap/container-lifecycle.ts`](https://github.com/supabase/cli/blob/ff05ee97bb4c50a66f2e04ef20675d65e04c1de2/apps/cli/src/command-internal/db-bootstrap/container-lifecycle.ts) — descreve preservar a etiqueta `com.docker.compose.project` para ferramentas que agrupam containers do stack, mesmo quando a criação é programática.
- [Supabase CLI v3 migration](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3) e [changelog 04/11/2026](https://supabase.com/changelog/supabase-cli-v3) — comandos e semântica mudaram. Não assumir que a versão atualmente publicada equivale à do host. **Não atualizar ou invocar `supabase start/stop`**.

**Hipótese técnica relevante:** os Vector foram criados por Supabase CLI contra o contexto Docker Windows `npipe`, herdando a transformação insegura para 2375. É uma hipótese **forte e reprodutível no código**, não uma prova de que essa versão específica do CLI lançou os containers existentes.

## 3. Arquivo novo e escopo

`scripts/R6U-READONLY-VECTOR-CLI-ORIGIN.ps1`:

1. Antes de consultar o daemon, verifica o SHA-256 do relatório R6S e sua classificação básica; recusa `DOCKER_HOST` remoto, exige Docker CLI local `docker.exe`, contexto efetivo `npipe` local e Linux engine.
2. Consulta **somente** `docker context show/inspect`, `docker info --format`, e `docker container inspect --format` dos dois Vector conhecidos, obtendo **apenas estado e objeto Config.Labels**. Falha se algum Vector não estiver `exited` ou se os rótulos estiverem malformados.
3. Processa rótulos **em memória** e publica apenas booleanos para `com.docker.compose.project`, `service`, `config-hash`, `version`, `working_dir`, `config_files`; rótulos `com.supabase.cli.project`, `com.supabase.service`, `com.supabase.stack-root` e `com.supabase.instance`; e igualdade entre nomes de projetos **sem publicar seus valores**.
4. Se houver exatamente um `supabase.exe` disponível no PATH, consulta apenas `--version` (não executa `start`, `status`, `stop` ou `npx`); caso contrário reporta `NOT_IN_PATH` ou `MULTIPLE_INSTALLATIONS_NOT_QUERIED`.
5. Grava um novo JSON **sanitizado** em pasta inédita Downloads e emite SHA-256. Não escreve nenhum token, senha, caminho de configuração Docker ou rótulo bruto.

A saúde dos oito serviços permanece **última evidência R6S**, não uma verificação atual nesta fase. Nenhum valor de label será reproduzido no relatório nem na tela.

## 4. Resultado esperado e gates

| Gate | Estado |
| --- | --- |
| R6R Windows 271/271 e ExitCode 0 | PASS_OFFLINE_ONLY |
| R6S leitura Windows dos dois Vector | PASS_READ_ONLY |
| R6T JSON íntegro e classificação | PASS_READ_ONLY |
| R6U integridade GitHub / diff / PowerShell syntax | PENDENTE checagem do commit final |
| R6U consulta de rótulos e versão | PENDENTE Windows |
| Proprietário da configuração do stack | A CONFIRMAR |
| A: Unix socket seguro e montável | BLOCKED / NOT_PROVEN |
| B: HTTPS/mTLS atingível pelo Vector | BLOCKED / NOT_PROVEN |
| C: manter os dois Vector contidos | RECOMENDADO / PRESERVADO |
| GitHub Actions, mutações Docker, SQL, HML, produção | NOT_RUN / NO-GO |

**Próximo passo após R6U:** usar versão local e assinatura de labels para identificar a família de inicializador e, somente com dados suficientes, elaborar **patch mínimo proposto** para observabilidade protegida. A proposta não autoriza restart de Vector, exposição de 2375, mudanças WSL/Docker, atualizações de CLI, alterações fiscais ou deploy. Antes de qualquer experimento real: backup, plano de rollback e gate independente de estabilidade dos oito serviços.
