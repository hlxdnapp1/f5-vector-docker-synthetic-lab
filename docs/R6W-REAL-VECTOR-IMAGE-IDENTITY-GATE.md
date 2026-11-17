# EXATA R24-03W R6W — Gate da versão REAL da imagem Vector, somente leitura

**Data:** 16/11/2026. **Controle Geral / Governança:** [Issue #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). O [catálogo #295](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/295) é referência OSS fiscal e ERP, sem necessidade de copiar código auxiliar para este incidente. **Repositório de LAB público isolado:** `hlxdnapp1/f5-vector-docker-synthetic-lab`; branch-base R6V `review/r6v-supabase-v2117-vector-recovery-decision-20261116`, commit imutável `1c84074526f50a7b4ff951aaae3d917328c94e84` ([PR Draft #21](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/21)).

## 1. Evidência já homologada — não repetir

- R6R: Windows **271/271 PASS** offline, `ExitCode=0`, commit `fe4c50436c04b8050d96713022bf67fa927adaaa`; não demonstra Vector real.
- R6S: dois Vector `exited`, ambos `DOCKER_HOST=http://host.docker.internal:2375` sem TLS, nenhum socket Linux montado, zero listener 2375/2376 detectado no Windows. **8/8 serviços protegidos healthy** na última leitura. Não foi verificada conectividade de dentro do namespace Linux.
- R6T: dois containers com metadados Compose, mas sem arquivo Compose identificado; 2513 e 2514 reinicializações históricas.
- R6U Windows: dois `com.supabase.cli.project=True`, dois `com.docker.compose.project=True`, valores de projeto diferentes, sem `config_files`, CLI local **2.117.0**, PASS somente leitura. Relatório `C:\Users\Administrator\Downloads\EXATA_R6U_ORIGIN_20261116_220905_24440ea2\R24_03W_R6U_ORIGIN_RESULT.json`; SHA-256 proprietário `A3490DC76815C1B77979619DEC434C3AF4BBAC932D97D0B52C8DE3FF85704737`. O arquivo não foi recebido para recálculo independente.
- R6V Draft: revisou exatamente o código oficial da tag `supabase/cli v2.117.0`, commit `21db855916f2c2b12f61cde923a27094b8528b23`, e registrou **C = manter contenção**, A/B não comprovadas.

## 2. Por que este gate é decisivo

A referência R6N–R6R usou o código do **Vector v0.53.0** (`vectordotdev/vector`, tag `v0.53.0`), enquanto o CLI **não atesta que o container do proprietário usa essa mesma versão**. Sem confrontar a imagem real, o laboratório de protocolo pode simular um cliente Rust/Bollard diferente do instalado. **Não assumir equivalência por API Docker.**

O código [`vector.service.ts` da versão CLI instalada](https://github.com/supabase/cli/blob/21db855916f2c2b12f61cde923a27094b8528b23/apps/cli/src/commands/start/services/vector.service.ts) define, no branch Windows `npipe`, `DOCKER_HOST=http://host.docker.internal:2375`, sem mount Unix; [`vector.yaml.ts`](https://github.com/supabase/cli/blob/21db855916f2c2b12f61cde923a27094b8528b23/apps/cli/src/commands/start/templates/vector.yaml.ts) contém `sources.docker_host.type=docker_logs` e `exclude_containers` **sem `docker_host: https://...` ou bloco `tls`**; o `vector.yaml` é renderizado como heredoc no comando de criação do container. A [versão Vector v0.53.0 `src/docker.rs`](https://github.com/vectordotdev/vector/blob/v0.53.0/src/docker.rs) aceita `https` com certificados, mas o suporte da biblioteca **não** torna o endpoint mTLS disponível ou alcançável.

## 3. Única nova operação R6W: leitura de metadados da imagem instalada

`scripts/R6W-READONLY-VECTOR-IMAGE-IDENTITY.ps1` recebe o caminho **local** do JSON R6U e verifica seu SHA-256, versão CLI e duas identidades/etiquetas esperadas. Recusa qualquer `DOCKER_HOST` remoto e exige Docker Engine Linux via contexto `npipe` local (Windows).

Consulta somente:

- `docker context show`, `docker context inspect`, `docker info --format`.
- Para cada um dos **dois Vector conhecidos**: `docker container inspect --format` para **estado**, **nome da imagem** e **ID SHA-256 da configuração da imagem**. Se o Vector não estiver `exited`, interrompe.
- `docker image inspect --format '{{.Id}}'` na imagem **local**, para confirmar que o ID de imagem instalado confere com o container, sem `pull`, `run`, `start` ou acesso a redes externas.
- `docker ps --all --format` apenas com nome/estado/saúde, para revalidar **2/2 db, analytics, studio, storage** saudáveis; não imprime nomes de outros containers.

O script exibe apenas uma classificação de famílias públicas `timberio/vector` e `ghcr.io/supabase/cli/vector`, a **tag de versão** quando reconhecida, o **SHA-256 da configuração da imagem** e o marcador de comparação com `v0.53.0`. Uma referência privada ou não reconhecida é apresentada como `UNKNOWN_OR_PRIVATE`, sem publicar o nome completo. **Não** lê variáveis, labels brutos, entrypoint/comando (poderiam conter chaves Logflare), arquivos, logs, dados PostgreSQL, certificados ou volumes.

Os campos são exclusivamente informações de metadados; **identidade da imagem não prova versão de `vector --version` em execução**, nem protocolo, nem acesso ao daemon. Mesmo uma tag exatamente igual a `0.53.0` é **TAG_MATCH_ONLY_NOT_RUNTIME_PROOF** até prova com digest/binário real em laboratório. Tags diferentes ou desconhecidas resultam em `LAB_VERSION_MISMATCH_OR_UNVERIFIED`: interromper reaproveitamento de testes R6N, planejar novo LAB específico da imagem REAL antes de qualquer teste de gateway.

## 4. Gates de aprovação

| Gate | Estado |
|---|---|
| R6R / R6S / R6T / R6U dentro de seus escopos | PASS com evidências Windows fornecidas |
| R6V auditoria do código `supabase/cli v2.117.0` | REVIEW_DOC_ONLY |
| R6W GitHub commit, blobs e diff | A verificar após publicação |
| R6W PowerShell sintaxe e identidade real das imagens | **NOT_RUN / PENDENTE WINDOWS** |
| Vector binário real, Docker streaming, rede, HTTPS/mTLS | **BLOCKED / NOT_RUN** |
| 8 serviços protegidos | Último PASS R6S, nova leitura R6W pendente |
| Novas alterações Docker/CLI, GitHub Actions, SQL, HML, fiscal, produção | **NO-GO** |

## 5. Próxima decisão a partir da evidência

Se as duas imagens forem as mesmas e a versão for fixável, preparar um **ambiente Vector realmente descartável e separado** daquela versão, com integração a gateway **somente leitura** autenticado sem expor Docker Engine. Caso as versões sejam diferentes, avaliar **dois** contratos de cliente isolados. O projeto não deve executar os dois Vector existentes, elevar privilégios, montar o socket Docker direto, habilitar HTTP 2375, atualizar CLI ou alterar oito serviços sem autorização, backup, rollback e testes de estabilidade.

**R6W é um gate de IDENTIDADE/SAÚDE somente leitura. Não é correção operacional.** Status de recuperação: **BLOCKED/NO-GO**.
