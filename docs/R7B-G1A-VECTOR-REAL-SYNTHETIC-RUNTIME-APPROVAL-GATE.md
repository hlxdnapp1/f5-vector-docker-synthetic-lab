# EXATA R7B-G1A — Gate para Vector 0.53.0 real em Docker sintético (DRAFT, SEM EXECUÇÃO)

**Governança:** [EXATA #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Repositório público isolado:** `hlxdnapp1/f5-vector-docker-synthetic-lab`. **Branch base exata `main`:** `af1a5bfd2e6ed753fb68f4622e893947a9dab919`. Esta entrega contém **SOMENTE DOCUMENTAÇÃO**, sem novo workflow, arquivos executáveis, acesso a daemon, merge ou dispatch.

## 1. Novo fato observado — G0C real de leitura PASS

Na tentativa 2 do [run 44005248638](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/actions/runs/44005248638), o GitHub Actions reportou `completed/success` com o job `133782378089` `completed/success` e todos os passos `success`. Saída do preflight no runner:

```text
R7A_HOST_DOCKER_REAL_READONLY=PASS
RUNNER=GITHUB_HOSTED_UBUNTU_2404_X64
DOCKER_ENDPOINT=LOCAL_UNIX_SOCKET
DOCKER_ENGINE_VERSION=28.0.4
DOCKER_MUTATIONS=0
VECTOR_BINARY=NOT_EXECUTED
SYNTHETIC_CONTAINERS=NOT_CREATED
BROKER_MTLS=NOT_IMPLEMENTED
STREAMING_FOLLOW_TRUE=NOT_TESTED
EXATA_HML_AND_PRODUCTION=NO_GO
```

A primeira tentativa `completed/failure` ocorreu antes de inicializar o runner por bloqueio de faturamento, regularizado pelo proprietário. **PASS de G0C prova apenas capacidade de leitura local do daemon de VM GitHub-hosted temporária; não é prova de reparo do Docker/Vector Windows.** Não presume custo zero fora do uso de runner público padrão.

## 2. Fonte de engenharia existente — não republicar histórico empilhado

As pesquisas anteriores estão no [PR Draft #26](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/26), que incorpora uma cadeia R6F–R6Z **não homologada para merge na main**. Usar como referência de estudo, não como dependência, cópia em lote ou substituição de implementação.

Revisões técnicas úteis:
- `docs/R6M-REAL-DOCKER-VECTOR-V053-EXECUTION-GATE.md`: matriz P0-V01 a P0-V10, contrato Vector 0.53.0, EVENT/INSPECT, logs `follow(true)`, riscos de endpoint Docker.
- `docs/R6P-REAL-STREAM-MTLS-ARCHITECTURE-GATE.md`: desconexão entre respostas finitas do código offline e streams reais, backpressure, HTTP chunked e topologia de namespaces.
- `docs/R6I-DOCKER-ENGINE-LIFECYCLE-DRAFT-GATE.md`: ledger write-ahead e replay de mutações; números de digest de imagem e config ID NÃO são intercambiáveis.
- `docs/R6Y-REAL-VECTOR-SECURE-ISOLATED-LAB-GATE.md`: não confundir isolamento de container com isolamento do daemon/host.
- `src/r6f-real-docker-adapter.mjs` e `src/r6g-loopback-mtls-gateway.mjs` no histórico R6F/R6G ainda usam conversão de `follow=true` para `follow=false` e respostas finitas. **NÃO podem ser ligados diretamente ao Vector real nem ao Docker atual.**

Fontes versionadas usadas na análise: [Vector v0.53.0 docker_logs](https://github.com/vectordotdev/vector/blob/v0.53.0/src/sources/docker_logs/mod.rs), [Vector TLS/docker_logs](https://vector.dev/docs/reference/configuration/sources/docker_logs/), [Docker Engine API](https://docs.docker.com/reference/api/engine/), [Docker daemon attack surface](https://docs.docker.com/engine/security/protect-access/).

## 3. Próxima implementação mínima — três fronteiras obrigatórias

**Fronteira A — Controlador (privilegiado, futuro job autorizado):** possuir sozinho o socket Unix local do runner GH-hosted; validar daemon isolado, contexto, imagem por digest oficial imutável e config ID Linux/amd64; limitar CPU/RAM/PIDs/tempo/rede; criar no máximo duas fixtures inteiramente fictícias, com journal **persistido antes de cada mutação**, nonce por execução, IDs obtidos e inspecionados. Nenhum comando Docker mutante fora desse processo. Não usar `--privileged`, `--network host`, mounts do Docker socket no Vector, portas publicamente expostas, `prune`, nomes de clientes ou tokens reais.

**Fronteira B — Broker GET-only (não privilegiar o cliente):** mTLS por certificados **efêmeros** e SAN/hostname/CA verificados; apenas métodos e rotas Docker GET explícitos para LIST/INSPECT/EVENTS/LOGS, IDs exatos, allowlist de nonce/projeto/labels validada por evidência fresca; filtrar *antes* de emitir bytes. LIST/INSPECT projetados; EVENTS NDJSON com `Actor.Attributes` compatíveis com Vector v0.53.0; LOGS com `follow=true`, RFC3339Nano e mux Docker de 8 bytes, limites por frame/linha/tempo, backpressure, cancelamento bilateral, revogação por sessão e nenhuma fuga parcial de dados externos. Negar tudo que for desconhecido, inclusive qualquer método mutante, e não encaminhar caminhos arbitrários ao daemon.

**Fronteira C — Vector oficial:** atestar binário **0.53.0** e digest/arquitetura/licença antes de executar; não conceder socket Unix nem API Docker sem mediação; provar rota TLS **do namespace do Vector** ao broker (loopback do host não é automaticamente acessível); sink somente local e sintético, sem logs brutos privados, sem secrets ou rede para EXATA/HML. A prova de compatibilidade deve consumir eventos, INSPECT e stream contínuo LOGS reais via broker e comprovar coleta apenas das fixtures autorizadas.

## 4. Critérios fail-closed para o próximo PR técnico

1. **Evidência de integridade:** novo PR Draft baseado diretamente em `main` exata; changeset mínimo, inventário de caminhos, `node --test`, `bash -n`, hashes Git, nenhuma origem privada.
2. **Sem execução inadvertida:** nenhuma alteração ou adição de gatilho automático; Workflow novo somente após revisão e autorização **separada de publicação**. Referenciar Environment protegido `EXATA-LAB-R7A`, mas não confundir `environment:` com autorização por si só.
3. **Prova de identidade do artefato:** revisar digest real da imagem e config ID; `0.53.0-alpine` é uma tag, NÃO um pin digest; não inventar valores. Se digest ou licença não estiverem confirmados, BLOCKED.
4. **Segregação efetiva:** recusar daemon remoto, VM `self-hosted`, egress externo, TCP `2375`, TLS indiscriminado, socket no Vector e qualquer container não registrado pelo controlador. Nenhum impacto em Docker Windows.
5. **Provas negativas:** cliente sem certificado ou com certificado inválido, método não GET, ID ou labels estranhos, EVENT sem `Attributes`, INSPECT incompatível, frame truncado, oversized, slow consumer, timeout e cancelamento devem falhar fechados sem emitir informações privadas.
6. **Teardown rastreável:** controlador pode remover **somente** IDs que criou e reatestou, sem remoção forçada genérica; verificar inspect 404 e ausência dos labels/IDs. Falha de cleanup impede PASS, mesmo em VM descartável.
7. **Relatório sem dados confidenciais:** commit, versão Docker/Vector, digests oficiais, contadores e duração, resultado de segurança/cancelamento/streaming e prova de cleanup; não publicar logs crus nem chaves.
8. **Proibido reivindicar reparo do Windows:** mesmo uma futura prova Vector real em VM do GitHub não valida o endpoint Windows `http://host.docker.internal:2375` nem libera restaurar os dois Vector originais.

## 5. Gates de aprovação — estados após R7A

| Gate | Status |
| --- | --- |
| G0A — revisão estática do preflight read-only | **PASS** |
| G0B — publicação R7A na main pública | **PASS**, commit `af1a5bfd2e6ed753fb68f4622e893947a9dab919` |
| G0C — leitura de Docker real em GitHub-hosted | **PASS**, run 44005248638, attempt 2, Engine 28.0.4 |
| R7B-G1A — presente revisão de requisitos | **DRAFT ONLY**, sem execução |
| R7B-G1B — nova implementação e testes offline | **NOT_IMPLEMENTED** |
| R7B-G1C — publicar workflow sintético | **BLOCKED**, requer autorização específica do proprietário |
| R7B-G1D — executar Docker mutante em VM descartável | **BLOCKED**, requer **outra** autorização explícita e controles demonstrados |
| R7C-G2 — Vector + mTLS + `follow=true` real | **NOT IMPLEMENTED / NO-GO** |
| Windows EXATA / HML / Produção | **NO-GO**, sem mudança |

**Próximo passo de engenharia recomendado:** desenvolver e testar um adaptador de streaming GET-only e contrato Vector 0.53.0 independentemente do daemon (sem reciclar R6F inseguro), com prova de fracionamento NDJSON/mux, backpressure, cancelamento e fail-closed. Depois, em PR separado, provisionamento sintético autorizado com ledger durável e teardown. Nenhum teste ou documentação daqui substitui a prova do binário Vector real.
