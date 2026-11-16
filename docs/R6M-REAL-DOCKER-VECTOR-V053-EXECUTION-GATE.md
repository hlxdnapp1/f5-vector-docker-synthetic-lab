# R6M — GO/NO-GO técnico: Vector 0.53.0 e Docker Linux REAL

**Data:** 16/11/2026. **Fonte de governança:** [EXATA issue #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Laboratório público separado:** `hlxdnapp1/f5-vector-docker-synthetic-lab`.

## 0. Autorizações e imutabilidade

**R6M é SOMENTE ARQUITETURA E REVISÃO EM PR DRAFT.** É proibido executar GitHub Actions, ativar workflow, mesclar PR, conectar qualquer daemon Docker, baixar imagem ou criar/iniciar/parar/remover containers reais; também são proibidas alterações no Windows original, HML, SQL, fiscal e produção.

Baseline offline: PR público R6L Draft #11, branch `review/r6l-offline-pull-relay-20261116`, commit exato **`1b632387ee4b68c29fdbd3d5630b60ed809f5b52`**, testes Node **179/179 PASS no Windows do proprietário**, integridade Git/hash/diff/sintaxe PASS. Relatório local `R24_03W_R6L_RESULT.json`, SHA-256 informado `02325203F31482D508D32ED090908F3C736EB8140AAD72104F8CA95DA8591B72`. O arquivo do relatório não foi fornecido para recálculo independente. O `main` público protegido está em `72775463905e9f81730f8f8bb5e5c054f136e6ff`. O único workflow existente no histórico empilhado é `r6f-offline-review-manual.yml`, que só executaria Node offline e **nunca foi executado**.

**Conclusão R6M:** 179 testes **PASS OFFLINE**; **Docker Engine real = BLOCKED**; **Vector oficial em daemon real = BLOCKED**; **HML/produção = NO-GO**. A criação deste documento não autoriza operação.

## 1. Constatações em código oficial Vector 0.53.0 (fonte versionada)

Referência de código fixa: https://github.com/vectordotdev/vector/blob/v0.53.0/src/sources/docker_logs/mod.rs

- `handle_running_containers()` chama `list_containers` com `all(false)` e filtros; se falhar, o componente registra `Listing currently running containers failed.` e encerra a inicialização da fonte (linhas na fonte próximas de 3084–3119 e 2599–2616).
- A fonte usa **fluxo de eventos Docker**. Para um evento, faz `actor.attributes.unwrap()`, e o campo `name` pode determinar inclusão do container (aprox. 3245–3305). Um evento sintético que omite `Actor.Attributes` **não satisfaz o contrato**.
- Para cada container, consulta `inspect_container` antes dos logs (aprox. 3466–3481); o JSON de inspect deve conter metadados que o parser real de `ContainerMetadata::from_details` consiga consumir, não apenas um objeto esquemático artificial.
- Usa `LogsOptionsBuilder::new().follow(true).stdout(true).stderr(true).since(...).timestamps(true)` (aprox. 3534–3555). **Conexão contínua é requisito real**, não opcional. A documentação atual do componente também descreve `delivery: best effort`, `egress: stream` e `auto_partial_merge` para mensagens Docker divididas.
- A documentação do Vector descreve `docker_host: https://localhost:PORT` e parâmetros `tls.ca_file`, `tls.crt_file` e `tls.key_file`; arquivos efêmeros devem ser montados/gerados somente num **runner autorizado**, com limpeza, nunca armazenados no GitHub.

Documentação oficial: https://vector.dev/docs/reference/configuration/sources/docker_logs/

## 2. Diferenças críticas no candidato público — não declarar compatibilidade

| ID | Lacuna observada na HEAD R6L | Condição verificável para liberar |
| --- | --- | --- |
| P0-V01 | R6F substitui `follow=true` por **`follow=false`** e `tail<=100`; R6G responde com `Content-Length` finito. | Streaming seguro real `follow=true`, limites de janela e tempo, pause/resume upstream, cancelamento e reconexão, sob mTLS. |
| P0-V02 | R6F/R6D `EVENTS` emite `Actor: {ID}` sem `Attributes`. O Vector v0.53.0 desreferencia `Actor.Attributes`. | Projetor seguro compatível com esquema realmente consumido, com `Attributes` sintéticos fixos, ação/tipo/tempos validáveis e sem atributos reais externos. |
| P0-V03 | R6G `INSPECT` emite campos fixos resumidos; `ContainerMetadata::from_details` ainda não foi exercitado com Vector oficial. | Teste do parser e eventos com **Vector v0.53.0 fixado**; nenhum valor de cliente/host real deve escapar. |
| P0-V04 | R6K valida quadros fragmentados e R6L faz pull de um gerador em memória, **não** controle de fluxo de um socket. | Adaptador real com backpressure por transporte, `AbortSignal`/timeout, streaming de 8-byte mux frame, máximo de bytes/quadros/tempo e nenhum leak parcial de dados crus. |
| P0-V05 | R6F socket Unix é GET-only e **dormente**; R6I POST/DELETE são apenas objetos inertes. | Provisionador real em processo separado, com identidade do daemon independente, imagem fixada por digest e registro durável pré-operação; políticas de escrita NÃO podem ser alcançadas pelo Vector. |
| P0-V06 | R6I escreve um manifesto de exemplo com digests **fictícios** e `AutoRemove=true`. | Resolver, verificar e registrar digest da imagem no registry e config ID local, arquitetura, licença e fonte; confirmar sem imagem `latest`; lidar com corrida de auto-removal. |
| P0-V07 | R6G compara ambiente por variáveis GitHub `GITHUB_*`, passíveis de imitação fora do GitHub; o transporte pode apontar para socket local sem prova de exclusividade. | Comprovação pela proveniência do job no GitHub + VM hosted efêmera, socket Unix local sem `DOCKER_HOST`, nenhum self-hosted, nenhum TCP2375 e ausência de contexto compartilhado; revisão independente. |
| P0-V08 | R6H/R6I possuem journals **somente em memória/JSON inerte**. | Ledger atômico e recuperável durante a vida do job, criado antes de cada mutação; teardown apenas IDs originados e inspecionados; relatório sem dados sensíveis; política fail-closed após interrupções. |
| P0-V09 | O gateway TLS R6G só tem handshake sintético local, sem execução do Vector. | CA/certificados cliente/servidor efêmeros, TLS 1.3/mTLS, cadeia e fingerprint pinados, validação de SAN e hostname, rejeição de cliente indevido; certificados descartados, nenhum key no PR. |
| P0-V10 | O workflow R6F atual executa exclusivamente testes Node, não testa Docker. | Workflow novo, mínimo e **manualmente despachado**, somente depois de **aprovação separada** para adicionar na `main` e **outra aprovação** para o primeiro job/uso Docker real. |

**Não corrigir lacunas via fallback inseguro** (ativar 2375 sem TLS, passar socket ao container Vector, montar pastas privadas, expor logs brutos, adicionar `--privileged`, liberar métodos de mutação ao gateway).

## 3. Arquitetura-alvo para futura execução AUTORIZADA

```text
Repositório PÚBLICO sintético — GitHub-hosted ubuntu-24.04 VM padrão
     | workflow_dispatch somente, SHA/digest aprovados, token contents:read
     | sem self-hosted, sem secrets privados/ERP, sem serviços externos
     |
     +-- CONTROLADOR DE LAB (processo isolado com socket Unix Docker)
     |      |- valida VM/daemon e manifest/config digests
     |      |- ledger write-ahead durable / nonce / job / exact container IDs
     |      |- provisiona SOMENTE 2 containers sintéticos com limites
     |      |- mantém guarda dos IDs e teardown idempotente
     |      '- NÃO expõe POST/DELETE ao Vector
     |
     +-- GATEWAY READ-ONLY de logs Docker
     |      |- GET allowlist + ID/label gate de inspeção real
     |      |- sanitize LIST, INSPECT, EVENTS + logs em fluxo seguro
     |      |- mTLS localhost e ACL por cliente
     |      '- timeouts/cancelamento/backpressure/limites
     |
     +-- VECTOR 0.53.0 oficial fixado por digest/commit
            |- docker_logs via https://127.0.0.1:PORT
            |- tls.ca_file / crt_file / key_file (temporários)
            '- sink de prova local, nenhuma saída privada
```

**Não confundir processos:** o controlador com acesso privilegiado ao socket do daemon deve estar fora do espaço de confiança do Vector. O gateway é somente leitura. O Docker socket outorga poderes amplos sobre o host; não basta que a API exposta ao cliente use mTLS.

**Requisitos do runner:** só `ubuntu-24.04` padrão GitHub-hosted, nunca self-hosted/`ubuntu-slim`, máquina realmente efêmera; execução em repo ainda `public`. GitHub Docs atualmente indicam que standard GitHub-hosted runners são gratuitos em repositórios públicos, mas isso **não autoriza execução** nem equivale a custo zero para registros, armazenamento externo ou produtos adicionais.

Fontes: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax e https://docs.github.com/en/actions/concepts/billing-and-usage .

**GitHub `workflow_dispatch` exige workflow na branch padrão** antes do disparo manual: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow . Nenhum workflow novo deve ser adicionado à `main` por esta revisão.

## 4. Critérios do primeiro teste real (não executar agora)

**G0 — revisão de mudança:** peer-review do código exato, commit/branch fixados, imagem e Vector versionados por digest, risco/licenças/SBOM; manifest com hashes, limites de CPU/RAM/duração, whitelist de processos e endpoints. Sem aprovar alterações em `main`, `BLOCKED`.

**G1 — permissão específica de CI:** proprietário autoriza adicionar **apenas** workflow `workflow_dispatch` à `main` do **lab público**; o workflow exige validação independente de commit, branch, visibilidade e runner `ubuntu-24.04`. Aprovação G1 não inclui rodar o job ou Docker. Em falha, nenhuma execução.

**G2 — permissão específica de Docker:** proprietário autoriza primeiro job isolado e limite de escopo: VM GitHub-hosted efêmera, **daemon Unix exclusivo**, imagens digest-pinned, 2 containers fictícios, duração curta, sem acesso ao Windows, sem dados reais, sem produção. Registrar ID do run e prova de identidade do job. Se daemon remoto/compartilhado, FAIL/BLOCKED.

**G3 — leitura real, antes de escrita:** daemon `/_ping`, `/version`, `/info` e imagem pré-verificada em modo consulta. Validar driver de logs e plataformas. Não registrar `docker info` bruto em log público. Sem versão/driver compatível, BLOCKED.

**G4 — ciclo de vida sintético:** controlador separado cria só contêineres do nonce/run, comprovadamente não-root, sem rede/mounts/segredos, privilégios desabilitados. Registrar intenção **antes** da operação, IDs depois e inspecionar cada objeto. Nenhuma mutação genérica ou `prune`.

**G5 — prova Vector real:** configurar Vector 0.53.0 para gateway **mTLS local** com arquivos certificados temporários; comprovar `list_containers`, `inspect_container`, fluxo de `events`, `follow=true` com `since`, eventos válidos (incluindo Attributes sintéticos) e linhas RFC3339Nano, mantendo o outsider invisível. Validar contagem/ordem, ausência de payload bruto, reconexão, falha de transporte e interrupção do consumidor.

**G6 — teardown fail-closed:** finalizar Vector e listener; parar/remover **apenas** IDs criados e identificados por nonce/run, com `inspect=404` e listagem por labels sem correspondência. Nunca `docker system prune`, nunca alterar outros objetos; se cleanup falhar, marcar **FAIL** e registrar pendência. Runner descartável não dispensa verificação.

**G7 — evidência:** relatório limpo (commit, SHA256 de manifesto, digest real, versão Docker, versão Vector, testes/erros, duração, teardown e ausência de outsiders) sem secrets, IP privado, env ou conteúdo de logs. Evidência aprovada **só nesse runner**, sem promover automaticamente HML.

## 5. Separação da recuperação Windows/HML

Mesmo depois de eventual `G0..G7 PASS` na VM, **não se deve modificar o Docker Desktop/WSL existente** automaticamente. A recuperação observacional do Windows tem governança própria: comparar a viabilidade de socket local isolável, endpoint HTTPS/TLS protegido ou manutenção da contenção, sem presumir que a topologia Linux hospedada se replica no Windows. A origem da falha histórica só será concluída com evidência autorizada do ambiente original. Prever backup/rollback e verificação de saúde dos serviços protegidos antes de qualquer mudança HML; produção requer autorização adicional independente.

## 6. Estado vinculante do R6M

| Gate | Estado |
| --- | --- |
| R6B–R6L, Node sintético no Windows | **PASS 179/179** |
| Análise do contrato oficial Vector v0.53.0 | **CONCLUÍDA (documental)** |
| R6M arquitetura e matriz de riscos | **PREPARADA EM DRAFT** |
| Fluxos Docker reais `follow=true` / EVENTS / INSPECT | **BLOCKED: implementação/prova ausente** |
| Imagens/daemon real e ledger persistente | **BLOCKED** |
| Workflow Docker real na main | **NÃO CRIADO / NÃO AUTORIZADO** |
| GitHub Actions executado | **NÃO** |
| EXATA HML / produção | **NO-GO** |

**Próxima entrega de engenharia útil:** um PR Draft de integração restrita que resolva **P0-V01, P0-V02 e P0-V03**, com contratos fielmente alinhados ao Vector v0.53.0, testes offline de fluxos/eventos/inspect e avaliação de vazamento. Isso não concede acesso ao daemon real; só após fechar demais gates de segurança será possível solicitar execução de prova real.
