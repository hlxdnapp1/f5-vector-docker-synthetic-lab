# EXATA R7B-G1B11 — Prova integrada de contratos sintéticos, somente offline

**Data:** 17/11/2026. **Governança:** [EXATA #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Repositório público isolado:** `hlxdnapp1/f5-vector-docker-synthetic-lab`, [PR Draft #28](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/28).

**Baseline anterior do PR:** `b2af15c6dcf6273d350aa06dd0fb1d366825fa51`. **`main` protegida:** `2d2ed3f84b23aec8bb0a508ddf15e89a73732ed0` (contém exclusivamente workflow manual Rust do PR #29; não foi alterada por G1B11). O run oficial Rust/Serde `44125765866`, tentativa 1, continua **PASS 12/12**, Cargo.lock audit **76 pacotes**, SHA256 `24d355e476160e994667707ddc275f7cf8bb0abef34d14850306a59caba6b223`. Não repetir esse run para afirmar nova validação de runtime.

## Entrega mínima G1B11

Criados apenas dois arquivos em branch Draft, sem modificar os componentes aprovados:

- `src/r7b-vector053-offline-contract-session.mjs`: coordena em memória a fixture Bollard 0.19.2, o normalizador R7B-G1B4, o plano GET-only Vector 0.53.0, os quatro eventos sintéticos (`start,unpause,die,pause`) e dois quadros de logs Docker mux stdout/stderr validados pelo parser bounded histórico. Os metadados LIST/INSPECT são revalidados e `Created` preserva `2026-11-17T12:00:00.123456789Z`. O campo `timeNano` dos eventos é emitido como token **numérico JSON i64**, sem arredondamento em JavaScript; um validador compara bytes exclusivamente contra o gerador canônico da fixture pública. Fragmentação de logs em blocos de 7 bytes testa a remontagem real do parser histórico e verifica cabeçalhos/canais/payload.
- `tests/r7b-vector053-offline-contract-session.test.mjs`: **36 testes Node nativos**, incluindo cinco grupos: plano de coleta, identidade/imagem/tempo, semântica de eventos, validação de logs e falha segura. Verifica payload adulterado, ID/label estrangeiros, campos duplicados, timestamps impossíveis, cabeçalhos, independência de buffers e proibição de entradas de outros tenants.

A função aceita somente um objeto simples com `created` e `nowSeconds`. Todas as respostas e identidades são fixtures públicas **fixas** (ID `a*64`, imagem/digest falsos `b*64`/`c*64`, label `LAB_ONLY`). Não recebe buffers arbitrários do daemon, URL, credenciais, segredo, nome de empresa, container real ou rede. Não possui transport, socket, HTTP, processo Vector, TLS/mTLS, API empresarial, SQL, filesystem de produção ou automação de ciclo de vida Docker.

## Resultados realmente executados

**Linux local isolado:** `/mnt/data/r7b_g1b11_20261117`, Node `v22.16.0`, verificações `node --check` PASS. Em runtime isolado, os fontes históricos foram recuperados do GitHub por integração autenticada ou usados como cache de bytes *apenas depois* de verificar seus Git blobs exatos; GitHub DNS não é acessível no shell, portanto não alegar `git clone` externo.

**Conjunto executado na mesma chamada Node:**

| Suíte | Testes |
|---|---:|
| R7B-G1B4 normalização de metadados | 66/66 PASS |
| R7B-G1B6 fixture Bollard | 33/33 PASS |
| R7B-G1B7 regressão nanos | 23/23 PASS |
| **R7B-G1B11** nova integração | **36/36 PASS** |
| **TOTAL conjunto** | **158/158 PASS**, 0 failed, 0 skipped, 0 cancelled |

Comando:
```sh
node --test --test-reporter=tap \
  tests/r7b-bollard-normalizer-preserve-nanos.test.mjs \
  tests/r7b-bollard0192-fixture.test.mjs \
  tests/r7b-offline-docker-api-normalizer.test.mjs \
  tests/r7b-vector053-offline-contract-session.test.mjs
```
**TAP conjunto local SHA256:** `5634867d10d6e838432db58c49e605efb5207177a4c3d8e12ee6117f8e4ba8c1`.

| Arquivo novo | Git blob SHA-1 validado no GitHub = arquivo executado | SHA-256 local |
|---|---|---|
| `src/r7b-vector053-offline-contract-session.mjs` | `f110948b9b56c3537b559849dcaf773d48eddab7` | `f698c81d142a5a395ffb0be6fc5afb34830534e2ebd7500881393c973bf56671` |
| `tests/r7b-vector053-offline-contract-session.test.mjs` | `e55faaa54c0c1abcdbffef32850b6732d0f39d5d` | `42605d20f5d877877e7a3f8903096a54daeb99239e8922e272798382afef61b8` |

**Blobs anteriores conferidos:** parser G1B `8a4b3736954d599355f309f1a766d88045cd9c20`; wire Vector G1B5 `526e972578ec06db00df5b3738e600040967b8d5`; fixture Bollard G1B6 `4ee6d2950b61d282d5e22537ef4f3d1efdd59c03`; normalizador G1B4 corrigido `e9c17dc885c6eeb52620f32796ca40370935ba7b`; testes antigos G1B4 `a55192f73cc42675493b77432697fb1dcd250c74`, G1B6 `a75b5665ed6cfad2f638e3dda772c9c3682d3872`, G1B7 `4c38553bf6147367d91aac08504659a34b913e63`.

## Limites — não extrapolar

**NÃO prova um coletor Docker/Vector operacional.** Os eventos de quatro ações são emitidos pelo gerador oficial sintético, mas **não são ingeridos pelo parser EVENTS legado**: G1B aceita `start/die` e `timeNano` *string*, e rejeita corretamente a forma Vector 0.53.0 com quatro ações e inteiro JSON i64. O teste R7B11-17 cobre explicitamente esse bloqueio, **sem enfraquecer ou editar G1B**. Os quadros LOGS são ingeridos pelo parser antigo e validados, mas `follow=true` existe somente como **opção descritiva**, não há stream de rede contínuo. A ordem de quatro eventos não simula de modo fiel o estado de lifecycle de um daemon; é cobertura de contrato offline.

Os **12/12 Rust reais** da etapa G1B10 são prova independente de `bollard-stubs::models`/Serde para metadados sintéticos; o teste JS G1B11 **não reexecuta Rust, Vector, Bollard em processo ou daemon Docker**. Os containers Vector Windows parados continuam não recuperados.

## Gates

| Gate | Status |
|---|---|
| R7B-G1B10 Rust/Serde em GitHub-hosted | **PASS prévio 12/12** |
| R7B-G1B11 integração sintética Node | **PASS OFFLINE 158/158 conjunto** |
| Ingestão completa dos 4 eventos reais com integer timeNano | **NOT IMPLEMENTED / BLOCKED** |
| Compatibilidade real de transport Docker, Vector 0.53, `follow=true`, mTLS | **NO-GO** |
| Merge do PR Draft #28, workflow novo, mutations Docker | **BLOCKED — novas aprovações específicas** |
| Windows EXATA / HML / produção | **NO-GO / intactos** |

**Próxima evolução segura:** em um PR Draft incremental, preparar um decoder de evento Docker i64 JSON numérico exclusivamente para fixtures sintéticas e provar integração com o plano GET/allowlist, com limite de tamanho e backpressure. Sem reutilizar o parser legado como se já suportasse os quatro eventos. Qualquer teste real em runner ou container requer avaliação e gate de autorização próprios.
