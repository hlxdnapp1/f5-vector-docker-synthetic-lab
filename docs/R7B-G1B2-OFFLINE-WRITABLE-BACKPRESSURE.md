# EXATA R7B-G1B2 — Controle de fluxo Node Writable OFFLINE (sem Docker)

**Data:** 17/11/2026. **Governança:** [EXATA #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Escopo:** PR Draft [#28](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/28), repositório público `hlxdnapp1/f5-vector-docker-synthetic-lab`.

**Base protegida:** `main=af1a5bfd2e6ed753fb68f4622e893947a9dab919`. Nenhuma publicação, novo workflow, dispatch, Docker, Vector, mTLS, SQL, Windows EXATA, HML ou produção está autorizada nesta fase.

## 1. Entrega incremental e garantias verificadas

- `src/r7b-offline-backpressure-pump.mjs`: novo módulo que **somente** importa `node:stream` e o parser offline existente `src/r7b-bounded-synthetic-stream.mjs` (Git blob `8a4b3736954d599355f309f1a766d88045cd9c20`); zero acesso a Docker socket, rede, arquivos externos ou serviços privados.
- `tests/r7b-offline-backpressure-pump.test.mjs`: 20 testes nativos, executados sobre o **módulo parser real e imutável do commit R7B anterior**, não sobre um mock. Cobrem EVENTS, LOGS, fragmentação de um byte, stdout/stderr, ordem, retenção do produtor sob `Writable.write() === false`, `drain`, `AbortSignal`, timeout, rejeição de outsider, cabeçalho truncado, UTF-8 inválido, fila excedida, fontes/sinks arbitrários e integridade de fonte sem I/O.

**Desenho do contrato:**

1. `R7BOfflineSource` é uma fonte **branded/owned**, criada exclusivamente com buffers em memória, limitada a 512 chunks, 2.048 bytes por chunk e 65.536 bytes por fonte. Clona os buffers de entrada e descarta cópias internas após leitura/cancelamento. Não aceita um socket ou iterador arbitrário.
2. `R7BOfflineSink extends Writable` usa `highWaterMark=1`, acumula apenas frames validados por uma instância `createR7BSyntheticStream`, aceita modo `hold/release` para simular consumidor lento e **não disponibiliza `bytes()` antes de `writableFinished`**. Ao abortar, apaga sua saída guardada.
3. `pumpR7BOffline` cria seu próprio parser; valida tipos/opções, processa um chunk por vez e **aguarda `drain` antes de puxar o próximo**. Limites de `drainTimeoutMs` (máximo 10 s), prazo da tarefa (máximo 30 s), bytes e registros. Em falha/abort, encerra a fonte, cancela parser e destrói o sink.
4. Em caso de erro entre `parser.take()` e a escrita de todos os seus frames, o controlador limpa **também os frames restantes que ainda não foram enviados**, além do frame corrente, evitando retenção parcial de dados em memória.
5. O parser anterior permanece **inviolado** e só libera eventos/logs com identidade **inteiramente sintética** e marcador fixo; não é um filtro de dados reais/tenant.

## 2. Evidências da execução local nativa

Ambiente isolado de teste: Node **v22.16.0**. `node --check` nos dois arquivos novos e no parser já aprovado: **PASS**.

Comando executado no layout de arquivos definitivo:

```sh
node --test --test-reporter=tap tests/r7b-offline-backpressure-pump.test.mjs
```

Resultado **20/20 PASS, 0 FAIL, 0 skipped, 0 cancelled**.

| Arquivo | Git blob SHA-1 (validado local e no GitHub) | SHA-256 do arquivo local |
| --- | --- | --- |
| `src/r7b-offline-backpressure-pump.mjs` | `ecfd63f0e38abf0ffddcb9101bb9e06b41537ad1` | `9832d5030546c056a20b160e82900ca97d2bf1a0a80e76193fb0556eb6f0b1fd` |
| `tests/r7b-offline-backpressure-pump.test.mjs` | `2ca81cb870db6359fd0bdbe61859b28000afaf8a` | `714cda0a55853b8e79763e9a3e33407a450dcd4e01c1d25d1fa540656aa74399` |

Relatório TAP local SHA-256: `0a2c594e9c502c17a8b6f5fcca5ff23d7ac7f21fcb0ce12b26d2400546d5b337`. Os bytes do relatório TAP **não foram enviados ao GitHub**, mas os resultados dos testes foram presenciados na execução local. Varredura de referências Docker remoto/privadas no código do pump: **PASS**.

**Os 26 testes históricos do parser R7B-G1B não foram reexecutados nesta etapa**; a interface do módulo foi validada por 20 novos testes integrados ao parser exato já aprovado.

## 3. Fronteiras de evidência — NÃO é um gateway real

- Embora o teste use o `Writable` nativo do Node e eventos reais de `drain`, o **upstream é somente uma fonte de Buffers em memória**. Não há pausa/retomada de socket/TCP, HTTP chunked, transporte GET, resposta contínua `follow=true`, tempo de conexão real nem revogação de autorização/identidade no daemon.
- A fonte e o sink podem demonstrar backpressure e cancelamento da **simulação offline**, mas ainda não comprovam compatibilidade com Vector v0.53.0, Bolllard, `Actor.Attributes` de um daemon Linux real, TLS com SAN/CA, controles de multi-tenant ou limpeza durável de containers.
- Um `PASS` de integração futura com daemon GitHub-hosted **não autorizaria** por si só reativar dois Vector locais ou alterar o Supabase Windows/HML.
- Nenhum secret, artefato privado, execução GitHub Actions ou recurso pago foi utilizado para R7B-G1B2.

## 4. Próximos gates

| Gate | Estado |
| --- | --- |
| R7A-G0A/G0B/G0C | **PASS**, G0C Docker real somente leitura em runner público |
| R7B-G1B (parser EVENTS/LOGS sintético) | **PASS OFFLINE ONLY**, 26/26 anteriores |
| R7B-G1B2 (pump Writable in-memory) | **PASS OFFLINE ONLY**, 20/20 novos integrados |
| R7B-G1B3 (adaptação para HTTP/TLS + identidade/stream real) | **NÃO IMPLEMENTADO** |
| R7B-G1C — publicação na main de novo código/workflow | **BLOCKED**, autorização específica futura |
| R7B-G1D — imagem/containers Docker mutantes | **BLOCKED**, outra autorização específica |
| Vector real / mTLS / coleta `follow=true` / recuperação Windows | **NO-GO** |
| EXATA/HML/produção | **NO-GO**, intactos |

**Decisão:** aceitar esta prova como etapa incremental de engenharia offline, não como homologação de coleta de logs real. Preservar o diff mínimo e PR Draft #28 até os próximos gates.
