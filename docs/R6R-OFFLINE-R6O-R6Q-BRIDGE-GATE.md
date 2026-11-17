# EXATA R24-03W R6R — Integração finita offline R6O → R6Q e cenário de replay sem checkpoint

**Data:** 16/11/2026. **Governança:** [EXATA #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Repositório público isolado:** `hlxdnapp1/f5-vector-docker-synthetic-lab`.

## Baseline: R6Q homologado pelo proprietário

- Branch base: `review/r6q-node-offline-backpressure-stream-20261116`, commit exato `84ba5dc65f92093dc9202d6ff8f4193c48d9def2`, [PR Draft #16](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/16).
- Resultado Windows independente informado: **GITHUB/COMMIT/DIFF/BLOBS/SHA256/LF PASS**, sintaxe **PASS**, Node.js **255/255 PASS**, **ExitCode=0**.
- Caminho do relatório no computador do proprietário: `C:\Users\Administrator\Downloads\EXATA_R6Q_FINAL_20261116_213738_d42b2f72\R24_03W_R6Q_RESULT.json`.
- SHA-256 do relatório declarado: `BF1281C9D47F018C468546BF0B2A9A55DD3F4D626601820D117002306EA81D88`. Os bytes do relatório não estão disponíveis neste ambiente para recálculo independente.
- GitHub Actions **NOT_RUN**; Docker e Vector reais **NOT_RUN**; HML/produção **NO-GO**.

## Alteração R6R (somente nova branch Draft)

- Novo `src/r6r-offline-synthetic-bridge.mjs`: importa classes *marcadas como offline* de R6O e R6Q; aceita apenas `R6OOfflineScenario`; exige dois GET planejados por R6O, `EVENTS` e `LOGS`. Materializa **completamente** os dois streams fake finitos sob limite de 512 chunks e 65536 bytes por stream, em RAM. Só depois reconstrói `R6QOfflineChunks` e os valida com `pumpR6QOffline` sobre `R6QOfflineSink`. Captura e apaga os buffers locais, fecha o cenário mesmo em exceção e devolve **somente contagens** e marcas explícitas `checkpoint=NONE`, `deduplication=NOT_PROVEN`, `trueStreaming=false`, `realTransport=false`. Não sai nenhum evento ou frame em bruto.
- `demonstrateR6RReplay` usa **duas instâncias fake independentes** e soma contagens, deliberadamente sem suprimir eventos duplicados. Não implementa `since`, reconexão, dedupe, exactly-once ou status de rede.
- Novo `tests/r6r-offline-synthetic-bridge.test.mjs`: **16 casos** de integração R6O/R6Q em memória, replay sem dedupe, uso único, proibição de instâncias arbitrárias, GET restrito, quotas, aborto, erro em logs, fragmentação e ausência de imports de rede. Não importa fluxos externos. O número de testes foi definido pela inclusão de 16 testes; **PASS só pode ser declarado após execução**.
- Este documento. Nenhum source/test prévio, workflow, Docker Desktop, Supabase HML, fiscal, SQL ou produção alterado.

## Limite operacional central

**R6R é uma ponte de buffers finitos e NÃO demonstra streaming real.** Como R6Q só aceita um array interno de chunks falsos, a integração R6R exige materializar todo o fluxo R6O antes de chamar o Writable. Não é possível inferir backpressure de rede, `socket.pause`, fluxo HTTP chunked, conexão contínua `follow=true`, reconexão de Bollard ou dedupe. A ponte foi desenhada justamente para **não disfarçar** esta lacuna de segurança: nenhuma classe aceita transportes genéricos. O gateway R6G continua com `follow=false` e `Content-Length` finito.

## Gates

| Gate | Status |
| --- | --- |
| R6Q Windows, Node 255/255 + ExitCode 0 | **PASS_OFFLINE_ONLY**, informado pelo proprietário |
| R6R GitHub branch/HEAD/blobs/diff | **PENDENTE DE VERIFICACAO A PARTIR DO COMMIT PUBLICADO** |
| R6R Node novo 16/16 e full 271/271 | **PENDENTE EXECUCAO INDEPENDENTE**; não herda PASS do R6Q |
| Vector 0.53.0/Bollard real | **NOT_RUN / BLOCKED** |
| Docker Engine / socket Unix / mTLS real | **NOT_RUN / BLOCKED** |
| GitHub Actions, workflow main | **NOT_RUN / SEM AUTORIZACAO** |
| EXATA HML/produção e oito serviços protegidos | **NO-GO** |

**Próximo gate que efetivamente resolve decisão técnica:** após homologação R6R, parar o acúmulo de mocks e tratar a decisão de topologia **A (Unix socket montável e autorizado) / B (HTTPS mTLS efetivamente acessível ao Vector) / C (manter contenção)**. Usar primeiro diagnóstico de leitura e fonte real de configuração Compose/Supabase CLI, com aprovação separada para qualquer modificação operacional ou primeiro teste Docker efêmero. Não configurar `host.docker.internal:2375` sem TLS. Não presumir `localhost` do host acessível a outro namespace de rede.
