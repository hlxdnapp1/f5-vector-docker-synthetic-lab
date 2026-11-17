# EXATA R7B-G1B4 — Normalização offline de Docker API LIST/INSPECT (DRAFT)

**Data:** 17/11/2026. **Governança:** [EXATA #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Laboratório público:** `hlxdnapp1/f5-vector-docker-synthetic-lab`, [PR Draft #28](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/28).

**Base da branch protegida:** `main=af1a5bfd2e6ed753fb68f4622e893947a9dab919`. Trabalho autorizado é SOMENTE código, testes e análise OFFLINE em branch DRAFT. Sem merge, workflow, dispatch, acesso real Docker, image pull, Vector, certificados, banco, Windows, HML ou produção.

## 1. Motivo e referência oficial

O projetor R7B-G1B3 anterior exigia um conjunto *exato* de campos de fixtures. Entretanto, a [API Docker Engine v1.44](https://docs.docker.com/reference/api/engine/version/v1.44/) distingue uma resposta resumida para `GET /containers/json` da resposta de detalhes `GET /containers/{id}/json`, cujos campos opcionais e metadados variam. O [Vector 0.53.0 docker_logs](https://github.com/vectordotdev/vector/blob/v0.53.0/src/sources/docker_logs/mod.rs) depende desses metadados e do fluxo de eventos/logs.

**Decisão:** preparar, ainda offline e sem mudar código aprovado, um normalizador que aceita **campos extras de formato semelhante ao Docker real**, verifica os atributos críticos de um único container inteiramente sintético e devolve apenas campos construídos a partir de allowlist. **NÃO é compatibilidade comprovada com um daemon real, Bollard ou Vector.**

## 2. Entrega e limites

- `src/r7b-offline-docker-api-normalizer.mjs` — módulo original Buffer→Buffer, 0 imports, sem I/O de rede/FS/daemon ou dados EXATA. Exporta `normalizeR7BOfflineDockerList`, `normalizeR7BOfflineDockerInspect`, `normalizeR7BOfflineDockerPair`.
- `tests/r7b-offline-docker-api-normalizer.test.mjs` — **66** testes nativos, casos válidos/negativos com shape Docker mais amplo, diferenças de identidade, ausência de campos obrigatórios, redes/mounts/portas, privilégio, imagem/labels, drift temporal, corpos oversized, UTF-8, BOM, chaves JSON duplicadas, filtragem de outsider e ausência de vazamento de dados brutos.

**Propriedades:** corpo no máximo 32 KiB; até 12 itens LIST; profundidade JSON máxima 12; UTF-8 estrito, rejeição de BOM e de chaves JSON duplicadas inclusive `\\u0049d` vs `Id`; identidade **pública fictícia e imutável**: ID `'a'.repeat(64)`, digest de imagem FAKE `'b'.repeat(64)` e config image ID FAKE `'c'.repeat(64)`. Não são hashes autenticados de imagens. Estado running; `HostConfig.NetworkMode='none'`; `Privileged=false`, `ReadonlyRootfs=true`; sem mounts/portas/devices/capacidades extras ou Env de container; labels de laboratório fixas. Somente ID sintético autorizado pode aparecer na projeção; corpos de estrangeiros nunca são encaminhados.

A função `Pair` valida LIST e INSPECT inteiramente e exige mesmo ID e segundos de criação antes de construir os dois Buffers; um INSPECT incorreto impede liberação de qualquer um. Strings privadas e campos extras de `Command`, `Path`, `LogPath`, `State.Pid`, `GraphDriver` são **ignorados/omitidos**, não impressos.

## 3. Testes nativos e integridade

Diretório novo e isolado `/mnt/data/exata_r7b_g1b4_20261117`, Node.js `v22.16.0`. Como acesso Git de saída do container é indisponível, os commits/branches e o código anterior foram conferidos por integração GitHub autenticada, e a nova implementação foi executada localmente antes do upload. Nenhum clone por rede foi inventado.

```sh
node --check src/r7b-offline-docker-api-normalizer.mjs
node --check tests/r7b-offline-docker-api-normalizer.test.mjs
node --test --test-reporter=tap tests/r7b-offline-docker-api-normalizer.test.mjs
```

**Resultado: 66/66 PASS, 0 FAIL, 0 skipped, 0 cancelled.** O arquivo `R7B_G1B4_TESTS.tap` permanece local (sem upload/deploy).

| Arquivo | Blob Git SHA-1 comprovado (mesmo arquivo local executado) | SHA-256 local |
| --- | --- | --- |
| `src/r7b-offline-docker-api-normalizer.mjs` | `b3ee03c4e742fe2919d03fc7d6c9b5cb5360e701` | `8ab3498e5c0dbec5ea3328196e5a679c302829c4a2d5851216d5d4464fa5ad2e` |
| `tests/r7b-offline-docker-api-normalizer.test.mjs` | `2e0fed1c41c17494e1527f0f30e69bf995c6ca39` | `4c602fbadf32368fcdc394a30ea5eecd865f78ceea690c2ccfcda517b19cf1b8` |

**SHA-256 do relatório TAP local:** `503c0b4c4da6f88bc71da92240257f220e9d02155d8385dcbf01acb00562cb10`.

Os **78 testes anteriores** R7B-G1B/G1B2/G1B3 permanecem historicamente PASS em suas respectivas evidências, mas **não foram reexecutados nesta rodada**. Seus arquivos não foram alterados. Consequentemente não há alegação de `144/144` PASS combinado neste commit.

## 4. Limites e próximos gates

Este normalizador só conhece um **ID sintético fixo**, não recebe autorização de tenant nem usa ledger de recursos criados. O fato de descartar campos adicionais não prova que um daemon Docker real aceitaria a mesma estrutura de projeção nem que os campos omitidos são dispensáveis ao parser do Vector 0.53.0. Uma futura prova do Docker real exige, no mínimo, shape verificado em runner efêmero, imagem por digest REAL, reatestado de identidade/proveniência, autenticação mTLS, isolamento efetivo do Vector e segurança de fluxos `follow=true`, eventos e cleanup. Nenhum desses controles é implementado aqui.

| Gate | Situação |
| --- | --- |
| R7A-G0C: Docker host real somente leitura GitHub-hosted | **PASS**, run #44005248638 tentativa 2 |
| R7B-G1B/G1B2/G1B3: suites offline anteriores | **PASS histórico: 78/78** |
| R7B-G1B4: normalizador de shape expandido offline | **PASS novo: 66/66** |
| Execução conjunta das 4 suites neste commit | **NOT RUN** |
| R7B-G1C: merge / publicação de novo workflow | **BLOCKED — autorização específica** |
| R7B-G1D: Docker mutante / pull / container | **BLOCKED — outra autorização** |
| Vector real / broker mTLS / follow=true | **NO-GO** |
| EXATA Windows, HML e produção | **NO-GO / INTOCADOS** |

**Esta entrega é DRAFT, não autoriza alterações produtivas nem recuperar os dois Vector parados.**
