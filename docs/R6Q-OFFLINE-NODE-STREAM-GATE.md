# EXATA R24-03W R6Q — Prova offline de backpressure com Node Writable e frames fictícios

**Data:** 16/11/2026. **Governança:** [EXATA #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Repositório público isolado:** `hlxdnapp1/f5-vector-docker-synthetic-lab`. **Base R6P:** `review/r6p-streaming-mtls-real-boundary-review-20261116`, commit `05ff1f022890c6c94fce4b3792190e4b5d5f4dda`. O proprietário havia informado R6O **227/227 PASS offline Windows**, commit `9960c6788de658bb8abf68482787d48edb8eed3d` (relatório local SHA-256 informado `7A52A578699A3BB6370FB32727454698D2C4E7EEB688CAE059FD6E4C1F73CD44`, não recalculado de bytes externos).

## Escopo e alterações mínimas

1. `src/r6q-offline-node-stream.mjs`: **novo módulo isolado**. A classe `R6QOfflineChunks` copia fontes fictícias pré-fornecidas para buffers privados e permite consumo único. A classe `R6QOfflineSink` estende o **Node Writable real** mas retém bytes somente em RAM e oferece controle determinístico de `hold/release`; `highWaterMark=1` expõe backpressure real da API Node, **não de TCP/HTTP ou Docker**. `pumpR6QOffline` aceita exclusivamente essas classes, sem aceitar `Writable` genérico ou iterador arbitrário.
2. O parser incremental aceita NDJSON de **EVENTS** com `Type=container`, `Action` em lista restrita, `Actor.ID` fictício público, `Actor.Attributes.name` sintético e inteiro `time`; logs Docker **LOGS** são frames mux de 8 bytes, stdout/stderr, timestamp UTC válido e marcador sintético fixo. Rejeita eventos, frames e UTF-8 inválidos, IDs estranhos e campos secretos. Valida **todas as unidades completas de cada chunk antes do primeiro write desse chunk**; um chunk posterior inválido não permite revogar frames anteriormente entregues.
3. Limites: até 512 chunks de 2048 bytes, 65536 bytes em cada sentido, buffer intermediário até 4096, linha EVENT até 1024 bytes, até 16 eventos ou 100 quadros de logs. `write()===false` aguarda `drain`; não lê novo chunk enquanto bloqueado. Abort/deadline cooperativos, timeout no `drain` e `finish`; erro encerra e limpa fonte e destrói sink. Nenhuma transmissão real, conexão Docker, socket, certificado, filesystem de runtime ou subprocesso.
4. `tests/r6q-offline-node-stream.test.mjs`: 28 testes nativos Node para eventos/logs fragmentados byte a byte, múltiplos registros no mesmo chunk, frame parcial, corrupção no mesmo chunk, retenção dos registros anteriores já liberados, segredo/canário, IDs estranhos, quotas, falha da fonte, cancelamento anterior e durante backpressure, timeout, higiene da fonte e rejeição de destinos genéricos.
5. Este documento. Não alterar arquivos anteriores, workflows, scripts, código do EXATA ou políticas operacionais.

## Evidência local efetivamente executada

- Node **v22.16.0**, `node --check` no novo source: **PASS**.
- `node --test tests/r6q-offline-node-stream.test.mjs`: **28/28 PASS**, 0 fail/skip/cancel em laboratório local isolado.
- Arquivos testados localmente têm Git blob SHA-1 esperados: source **`2b5cfd0f5ccb984c681605432243503c9fc4698b`**, tests **`3197b856adc638d11a7ab60a72b338ec82727ce4`**. Validar a igualdade com os blobs realmente publicados no GitHub antes de atribuir a execução ao commit remoto.
- **Windows completo 255/255 (227 anteriores + 28 R6Q) PENDENTE**: executar em novo clone do commit GitHub publicado, com `node --check` e `node --test`, sem npm install nem ações Docker. Não alegar 255 PASS sem relatório do proprietário.
- Não houve execução de GitHub Actions, Docker Engine, Vector/Bollard real, endpoint HTTPS/mTLS, Windows HML, SQL, Fiscal ou produção.

## Limitações vinculantes

- A classe `R6QOfflineChunks` não está conectada ao `R6OOfflineScenario` e não reproduz chamadas reais de `GET`, `follow=true`, inspeção Docker ou reciclagem de containers. O objetivo é testar isoladamente o comportamento nativo `Writable.write()/drain`, validação incremental e caminhos de falha com dados fictícios, sem aumentar a superfície de ataque R6O.
- Segurar um callback de `_write` **simula pressão do consumidor em memória**; não demonstra que `socket.pause()`, TLS, `AbortSignal` ou o fluxo upstream sejam corretamente interrompidos. A infraestrutura real, o tratamento de sockets bloqueados e a revalidação de identidade durante streams continuam faltando.
- A validação antes de cada chunk limita a exposição do chunk, mas **não** garante atomicidade de stream infinito: dados já liberados em chunk anterior não podem ser revogados.
- Os dados sintéticos e os limites de tamanho **não** autorizam retorno de logs ou env de terceiros, ligação ao daemon, manipulação de imagens ou promoção a HML. Conteúdo do sink permanece apenas em memória no teste, e não é criptografado em repouso.
- `R6QOfflineSink` é propositalmente incompatível com qualquer stream externo. Nunca trocar por `res` HTTP ou socket real por alteração mecânica sem revisão arquitetural, autenticação mTLS e testes independentes.
- Sem Vector 0.53.0 executado, não há prova de compatibilidade com o seu parser Rust, nem resolução da falha histórica `host.docker.internal:2375`.

## Gates

| Gate | Estado |
| --- | --- |
| R6O Windows, 227/227 OFFLINE | PASS reportado pelo proprietário |
| R6P arquitetura e lacunas | REVIEW_DOC_ONLY, PR Draft |
| R6Q Node local focalizado, 28/28 | PASS offline, sujeito à verificação dos blobs publicados |
| R6Q GitHub HEAD/blobs/diff e Windows 255/255 | PENDENTE homologação independente |
| GitHub Actions, Docker Engine e Vector reais | NOT_RUN / BLOCKED |
| Gateway HTTP(S)/mTLS real, daemon exclusivo, ledger e cleanup | BLOCKED |
| EXATA Windows HML / fiscal / produção | NO-GO |

**Próxima etapa candidata R6R:** integrar exclusivamente objetos falsos de R6O/R6Q em um plano de requisições inerte e demonstrar cenários de reconexão e checkpoints sem rede. Qualquer primeiro teste real continua exigindo autorização separada da Issue #315, backup, rollback e gates do R6M/R6P.
