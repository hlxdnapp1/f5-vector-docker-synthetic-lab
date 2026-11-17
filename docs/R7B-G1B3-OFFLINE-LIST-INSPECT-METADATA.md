# EXATA R7B-G1B3 — Docker LIST/INSPECT metadata projection (OFFLINE / SYNTHETIC ONLY)

**Data:** 17/11/2026. **Governança:** [EXATA issue #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Laboratório público isolado:** `hlxdnapp1/f5-vector-docker-synthetic-lab`. **PR Draft:** [#28](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/28).

**Base exata:** `main=af1a5bfd2e6ed753fb68f4622e893947a9dab919`. Esta etapa autoriza somente investigação, código e testes offline em branch Draft. Não autoriza merge, workflow/dispatch, Docker daemon, download de imagens, containers, SQL, HML ou produção.

## 1. Implementação nova, sem alterar módulos aprovados

- `src/r7b-offline-list-inspect-projection.mjs` expõe `projectR7BOfflineList`, `projectR7BOfflineInspect`, `projectR7BOfflinePair`. Recebe apenas `Buffer` JSON da fixture em memória. **Nenhum import**, servidor, cliente HTTP/Docker, socket, filesystem, token, segredo ou operação de rede.
- `tests/r7b-offline-list-inspect-projection.test.mjs`: **32 testes nativos** de contratos positivos e negativos. Preserva sem alterações os 46 testes anteriores do PR Draft.
- Resposta LIST: permite somente um único ID público sintético `'a'.repeat(64)`, nome `/r7b-synthetic-fixture`, imagem/digest **fictícios** e labels `r7b.lab.owner=LAB_ONLY`, `r7b.lab.role=fixture`, running. Containers estrangeiros com IDs sintaticamente válidos são ignorados e nunca retornados; entradas malformadas bloqueiam o lote, duplicação do ID autorizado bloqueia o lote.
- Resposta INSPECT: exige pedido pelo ID sintético exato; mesmo ID/nome/imagem/labels/estado; rootfs read-only, `Privileged=false`, `NetworkMode=none`, nenhum mount, TTY ou network. Reconstrói só campos de allowlist; não encaminha `Env`, `LogPath`, caminhos privados nem campos extras.
- Resposta combinada: exige que LIST inclua exatamente o ID autorizado e que INSPECT seja coerente antes de retornar **qualquer um** dos dois buffers de saída.
- Limites: corpo JSON máximo 16 KiB, LIST máximo 12 entradas, UTF-8 estrito, JSON válido, até 10 níveis aninhados e rejeição de **chaves JSON duplicadas**, inclusive grafadas com escapes Unicode equivalentes. Buffer de saída construído novamente, independente do buffer de entrada.

## 2. Prova de teste nativo e hashes

Executado em diretório isolado `/mnt/data/exata_r7b_g1b3_metadata_20261117`, com base dos quatro arquivos anteriores conferida por **Git blob SHA-1 exato 4/4 PASS**.

- Node.js `v22.16.0`: `node --check` dos **6 arquivos** fonte/testes: PASS.
- `node --test --test-reporter=spec tests/r7b-offline-list-inspect-projection.test.mjs` = **32/32 PASS**.
- Comando conjunto:
```sh
node --test --test-reporter=tap tests/r7b-bounded-synthetic-stream.test.mjs tests/r7b-offline-backpressure-pump.test.mjs tests/r7b-offline-list-inspect-projection.test.mjs
```
**78/78 PASS**, 0 fail, 0 cancelled, 0 skipped. SHA-256 do TAP local: `eb4811685bdaebe167ab8cfa1158c6c2ccbe0b204c1dc3873fa865b72916f9af`. Este TAP é arquivo local do laboratório da conversa; não foi publicado como artifact do Actions.

| Novo arquivo | Git blob SHA-1 verificado | SHA-256 local |
| --- | --- | --- |
| `src/r7b-offline-list-inspect-projection.mjs` | `c504f03a9fa06ed093d07f93a60100453ffff1b3` | `2aa619a084b21e4593de524cd7582abb72101e495a37802a0eb3cd18764ff578` |
| `tests/r7b-offline-list-inspect-projection.test.mjs` | `cee044a47a61f40a23ebc6511eba4995b976c05a` | `24a92ed2dc827c9e558394d122a69342a2de68412ca6019159bf1ac970592e14` |

**Registro de correção fail-closed:** o primeiro upload GitHub do arquivo de testes teve mesmo tamanho, mas conteúdo divergente (Git blob `a2d9cd4bc2b0dfd11d6b0dd435d776843ff56ca1`). Não foi homologado. O upload foi corrigido na mesma branch, conferido em **45 blocos independentes** e o GitHub respondeu com o blob final `cee044a47a61f40a23ebc6511eba4995b976c05a`, igual ao testado localmente. Nenhum outro arquivo foi alterado para essa correção.

## 3. Limitações explícitas (NO-GO real)

**ESTE MÓDULO É UM PROJETOR DE FIXTURE SINTÉTICA E NÃO UM PARSER GERAL DA API DOCKER.** O Docker Engine API usa esquema aberto, com campos adicionais em LIST e INSPECT, e o Vector oficial usa estruturas detalhadas distintas. Exigir a forma exata da fixture é apropriado para o teste de isolamento, mas provavelmente rejeitará respostas reais. Não afirmar interoperabilidade Docker/Vector 0.53.0 a partir destes testes. Referência: [Docker Engine API v1.44](https://docs.docker.com/reference/api/engine/version/v1.44/).

A validação de identidade por constantes públicas fictícias não substitui autorização criptográfica, revalidação de labels/IDs no daemon e isolamento por projeto. Não há socket, transporte GET, TLS/mTLS, certificado, SAN, stream `follow=true`, backpressure de rede, Vector real, ledger durável ou limpeza de fixtures. Ninguém deve usar este módulo para expor logs ou metadados reais, conectar-se ao Docker Desktop Windows ou reiniciar Vector.

## 4. Gates

| Gate | Estado |
| --- | --- |
| R7A-G0C — leitura de Docker real, runner público isolado | **PASS** (run 44005248638, attempt 2) |
| R7B-G1B — EVENTS/LOGS sintéticos | **PASS OFFLINE** (26/26) |
| R7B-G1B2 — pump Writable/AbortSignal offline | **PASS OFFLINE** (20/20) |
| R7B-G1B3 — LIST/INSPECT sintéticos | **PASS OFFLINE** (32/32; combinado 78/78) |
| Projeção LIST/INSPECT do Docker Engine real | **NOT IMPLEMENTED / NO-GO** |
| Vector 0.53.0 real, mTLS, `follow=true`, G1/G2 Docker mutante | **BLOCKED**, revisão e autorizações separadas |
| Publicar PR Draft #28 na `main` | **BLOCKED**, autorização específica do proprietário |
| Windows EXATA, HML, produção | **NO-GO / INTOCADOS** |

**Próxima engenharia recomendada:** contrato de normalização de respostas Docker reais via allowlist de campos com revalidação de identidade contra daemon efêmero e projeção segura; projeto separado para fluxo autenticado GET-only, mTLS e ciclo de containers sintéticos, após revisão e autorizações independentes.