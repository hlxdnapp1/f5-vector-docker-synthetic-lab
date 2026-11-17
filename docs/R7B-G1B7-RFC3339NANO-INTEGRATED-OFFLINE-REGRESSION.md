# EXATA R7B-G1B7 — Correção mínima da precisão RFC3339Nano com regressão integrada OFFLINE

**Data:** 17/11/2026 · **Repositório público de laboratório:** `hlxdnapp1/f5-vector-docker-synthetic-lab` · **Governança:** [EXATA #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315) · **PR Draft:** [#28](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/28).

**Base preservada:** `main=af1a5bfd2e6ed753fb68f4622e893947a9dab919`. **Baseline deste incremento:** `ca4051de41506ead7c76ac821e2cbb4d2e431916`. Esta etapa modifica somente arquivos sintéticos no PR Draft; **sem merge, workflow novo, Actions dispatch, Docker real, Vector real, certificados, SQL, HML, Windows ou produção**.

## 1. Falha reproduzida antes do patch

Arquivos locais do G1B4 e G1B6 obtidos de fontes versionadas foram conferidos por `git hash-object`, respectivamente:
- `src/r7b-offline-docker-api-normalizer.mjs` **`b3ee03c4e742fe2919d03fc7d6c9b5cb5360e701`**;
- `src/r7b-bollard0192-fixture.mjs` **`4ee6d2950b61d282d5e22537ef4f3d1efdd59c03`**;
- suíte antiga G1B4 **`2e0fed1c41c17494e1527f0f30e69bf995c6ca39`**.

A fixture validada forneceu `INSPECT.Created = 2026-11-17T12:00:00.123456789Z`. O normalizador antigo devolveu `2026-11-17T12:00:00.000Z`: **perda confirmada de nove casas fracionárias**. Isso decorre de `new Date(created*1000).toISOString()` que remonta o timestamp a partir dos segundos inteiros, apagando a fração original.

## 2. Correção localizada: três caminhos apenas

1. **Atualizado** `src/r7b-offline-docker-api-normalizer.mjs`: agora o módulo reutiliza `inspected.Created` **somente depois** de `inspectTarget` e `inspectSeconds` validarem seu conteúdo, no caminho INSPECT individual e no par LIST/INSPECT. `safeInspect` não cria mais uma nova data a partir dos segundos. Retidas validações de identidade sintética, estado, labels, rede none, rootfs read-only, proibição de mounts, tamanho, UTF-8, duplicação de JSON, restrição temporal e coerência entre segundos LIST/INSPECT.
2. **Atualizado** `tests/r7b-offline-docker-api-normalizer.test.mjs`: o caso `R7B4-19` anteriormente **exigia o truncamento** (`Created == stamp`). Alterada somente a expectativa para `Created == o.Created`; os demais casos originais mantidos.
3. **Adicionado** `tests/r7b-bollard-normalizer-preserve-nanos.test.mjs`: 23 testes integrados reais de Node, usando os dois módulos efetivos G1B4 e G1B6 (sem mock), cobrindo precisão de 1 a 9 dígitos, diferença de 1 ns, timestamp sem fração, metadados allowlist, outsiders, validação negativa, falha de par, dados privados, limite de buffer, memória independente e ausência de I/O.

**Atenção:** esta alteração corrige fidelidade textual das datas **para a fixture sintética**. Não torna o laboratório um desserializador Serde, gateway Docker ou coletor Vector.

## 3. Evidências nativas e hashes exatos

Ambiente novo e isolado: `/mnt/data/r7b_g1b7_20261117`, Node **v22.16.0**, rede GitHub indisponível no runtime local; fontes reobtidas pela integração GitHub e reconstruídas localmente com verificação de Git blob exato. Nenhum `git clone` de rede local foi realizado.

**Fail-closed observado:** após corrigir o fonte, antes de atualizar a asserção obsoleta, a suíte antiga ficou **65/66 PASS, 1 FAIL** no caso `R7B4-19` que esperava o truncamento. Essa divergência foi explicitamente tratada, sem suprimir o teste. Em seguida:

```sh
node --check src/r7b-offline-docker-api-normalizer.mjs
node --check tests/r7b-offline-docker-api-normalizer.test.mjs
node --check tests/r7b-bollard-normalizer-preserve-nanos.test.mjs
node --test --test-reporter=tap \
  tests/r7b-offline-docker-api-normalizer.test.mjs \
  tests/r7b-bollard0192-fixture.test.mjs \
  tests/r7b-bollard-normalizer-preserve-nanos.test.mjs
```

**Validação conjunta executada:** **122/122 PASS**, 0 fail, 0 skipped, 0 cancelled: **66** casos G1B4 com expectativa corrigida + **33** casos G1B6 intactos + **23** casos novos G1B7. Relatório `tests-combined.tap` local SHA-256 **`c4c083fb7650a77ef5d5902ea6e4a16b91c08da14f4d295e732316f68beee89e`**. Nenhuma execução GitHub Actions foi iniciada.

| Caminho afetado | Git blob SHA-1 validado (mesmo arquivo local testado) | SHA-256 local |
|---|---|---|
| `src/r7b-offline-docker-api-normalizer.mjs` | `e9c17dc885c6eeb52620f32796ca40370935ba7b` | `dda56cb4565f3fb26c7e43c8a7f3fb5ae988103747a70f8baf2dd963e5771221` |
| `tests/r7b-offline-docker-api-normalizer.test.mjs` | `a55192f73cc42675493b77432697fb1dcd250c74` | `f7a6bd7488349cc4a42ac41f6d9ca3a26b7191011f6423e7c399b79dace67aaf` |
| `tests/r7b-bollard-normalizer-preserve-nanos.test.mjs` | `4c38553bf6147367d91aac08504659a34b913e63` | `e249fedd7c5a2e8825b9d1ccc87a0ca4a2f1cb107afc9617d84e88b81b7615d5` |

**Escopo de prova:** somente essas **três** suítes foram reexecutadas de modo conjunto. Os outros incrementos anteriores continuam com evidências históricas, mas **não** foram reexecutados; não declarar que todos os testes do Draft passaram em uma única execução.

## 4. Gates e continuidade

| Gate | Estado |
|---|---|
| G1B7 precisão INSPECT com fixtures sintéticas | **PASS OFFLINE, 122/122 testes relevantes** |
| Fonte G1B4 antiga e fixture G1B6 | **Comparação por Git blob PASS** |
| Rust `serde_json::from_slice::<ContainerInspectResponse>` com Bollard exato | **NOT RUN / NO-GO** |
| Daemon Docker real, Vector executável, mTLS, `follow=true` de rede | **NOT RUN / NO-GO** |
| G1C publicação/merge em `main` | **BLOCKED — exige aprovação específica do proprietário** |
| G1D Docker mutante, downloads e containers | **BLOCKED — aprovação distinta** |
| EXATA Windows, HML, produção | **NO-GO / intactos** |

**Próxima atividade segura:** estudar a viabilidade de desserialização Rust `BollardDate` em ambiente descartável sem conexão a Docker; preparar testes pinados do modelo e só executar quando dependências e autorização da etapa estiverem disponíveis.
