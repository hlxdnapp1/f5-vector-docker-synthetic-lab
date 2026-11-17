# EXATA R7B-G1B5 — Vector v0.53.0: contrato wire oficial vs laboratório (OFFLINE DRAFT)

**Data:** 17/11/2026. **Governança:** [EXATA #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Laboratório público:** `hlxdnapp1/f5-vector-docker-synthetic-lab`, [PR Draft #28](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/28). **Base protegida:** `main=af1a5bfd2e6ed753fb68f4622e893947a9dab919`.

**Autorização:** só código e testes locais em branch Draft. **Não** fazer merge, dispatch de Actions, HTTP Docker, imagem, container, Vector executável, mTLS, SQL, Windows/HML/produção. Nada aqui autoriza reiniciar os dois Vector originais.

## 1. Fonte primária verificada, tag/commit/licença

- Projeto oficial: [vectordotdev/vector](https://github.com/vectordotdev/vector), tag anotada `v0.53.0`, objeto tag `ed2635593b5a6641735accae8e9c94c5dade52c9`, commit **`2b51b40a7a0b40996350d73cf46791c7e991fcb6`**.
- Código auditado: [`src/sources/docker_logs/mod.rs`](https://github.com/vectordotdev/vector/blob/2b51b40a7a0b40996350d73cf46791c7e991fcb6/src/sources/docker_logs/mod.rs), blob Git **`45268788d45cc869f36b34d9b9791c05cd7b3e83`**. `Cargo.toml` version `0.53.0`, licença declarada `MPL-2.0`. Referência examinada para contrato, **nenhum código Rust copiado**.
- Docker: [eventos da Engine](https://pkg.go.dev/github.com/docker/docker/api/types/events) representam `timeNano` como **inteiro assinado de 64 bits em JSON**, não string; no JavaScript, parse como `Number` pode perder precisão acima de `2^53-1`.

## 2. Matriz extraída do código oficial (não inferida de fixtures)

| Operação | Exigência Vector v0.53.0 | Evidência no Rust | Estado de prova |
| --- | --- | --- | --- |
| Inicialização | `list_containers`, `all(false)`, filtros opcionais por label/imagem, lê `id` e `names`; ignora prefixo `/` no nome | `mod.rs` linhas 531–586 | Contrato simulado, sem daemon |
| INSPECT | `inspect_container(id, None)`; metadados vêm de `details.config`, `details.name`, `details.created`, `config.labels`, `config.image` | linhas 749–757 e 1169–1212 aproximadamente; verificar a posição se reformatado | Testes somente sintéticos |
| EVENTS | stream filtrado por **`start`, `unpause`, `die`, `pause`**, tipo `container`, `since` início de processo; campos `action`, `actor.id`, `actor.attributes.name` | linhas 423–451, 629–665 | Plano offline e 4 eventos falsos |
| LOGS | `logs(id)`, `follow(true)`, `stdout(true)`, `stderr(true)`, `timestamps(true)`, `since(info.log_since() as i32)` | linhas 788–800 e 1018–1025 | Plano offline, sem stream |
| Timestamp | `log_since()` usa último log, ou instante de início do processo, **menos um segundo**; conversão a `i32` sugere risco após 2038 | linhas 1018–1025 e 795 | Guard local `<=2147483647`, NÃO corrige Vector |
| Logs | `LogOutput` stdout/stderr/console; extrai timestamp RFC3339, considera `\n` e registros parciais, pode reagregar | linhas 1037–1130 | Sem testes reais Bollard |

**Diferenças reais do laboratório anterior:** o módulo R7B-G1B tinha ações `start|die` somente e exigia `timeNano` **string**. Essa fixture não representa integralmente eventos que o Docker/Vect​​or podem consumir. O G1B5 **não altera** o módulo homologado; cria um contrato independente para futuras integrações.

## 3. Novo contrato testado

- `src/r7b-vector053-wire-contract.mjs` — **zero imports**, 100% offline; somente configura um *plano descritivo* de quatro operações GET, fixadas no ID público fictício `a...`, label `r7b.lab.owner=LAB_ONLY`; não cria URL externa, listener, socket, cliente HTTP ou Docker.
- `renderR7BVector053SyntheticEvent` constrói exclusivamente mensagem `Type/Action/Actor/time/timeNano` de fixture fictícia. Para evitar arredondamento em IEEE-754, recebe `timeNano` como decimal textual, verifica com `BigInt`, e insere o token numérico **sem aspas** no JSON de saída; jamais aceita JSON bruto de Docker nem IDs arbitrários.
- `tests/r7b-vector053-wire-contract.test.mjs` — 28 testes nativos de 4 ações, GET-only, filtros, `follow=true`, limites `i32/i64`, nanosegundos exatos, truncamento de autorização a ID fixo, campos extras/getters, imutabilidade e ausência de I/O.
- **Não há evidência de que Bollard/Vector efetivamente desserializou ou coletou essas fixtures.** Esses artefatos não são gateway, broker, sistema de autorização para dados reais, nem normalizador de saída de daemon.

## 4. Evidências verificadas

Executado localmente em diretório novo isolado `/mnt/data/r7b_g1b5_vector_compat_20261117`, Node.js **v22.16.0**. Internet/DNS GitHub não estava disponível no runtime local: consultas de branches, conteúdo fonte oficial, commits, upload e blobs foram realizadas pela **integração GitHub autenticada**. Não alegar clone de rede local.

```sh
node --check src/r7b-vector053-wire-contract.mjs
node --check tests/r7b-vector053-wire-contract.test.mjs
node --test --test-reporter=tap tests/r7b-vector053-wire-contract.test.mjs
```

- **28/28 PASS**, 0 FAIL, 0 skipped, 0 cancelled, no Node local.
- Hashes dos **arquivos exatamente testados** coincidem com os blobs retornados no GitHub depois do upload:

| Caminho | Git blob SHA-1 | SHA-256 local |
| --- | --- | --- |
| `src/r7b-vector053-wire-contract.mjs` | `526e972578ec06db00df5b3738e600040967b8d5` | `454ecf2ddb86264217378ed9f93b11bbfd65f90626e3590aeb3facdaac814eba` |
| `tests/r7b-vector053-wire-contract.test.mjs` | `7d5687d22ca3f280d9f629f0254764f231fed02b` | `2e16352b66a0f81e236c4fe6c7d0578b3ed28340d1d55e386518247380271e89` |

- TAP local `R7B_G1B5_28_TESTS.tap`, SHA-256 `a2fb6620f2124a642476692e47ac9c0b81ef7ff6af691c6cdc6bfb0d749c1858` — **não publicado como Actions artifact**.
- As suítes anteriores **26+20+32+66=144 PASS históricos** não foram reexecutadas nesta etapa, portanto **NÃO** declarar `172/172` juntos.

## 5. Aprovação e NO-GO

| Gate | Estado |
| --- | --- |
| R7A-G0C — Docker Engine READ-ONLY em runner GH-hosted | PASS prévio (run #44005248638, tentativa 2) |
| R7B-G1B–G1B4 | PASS histórico **offline somente** |
| R7B-G1B5 — contrato oficial reconstituído apenas em memória | **PASS OFFLINE 28/28** |
| Docker Engine real + Bollard/Vector 0.53.0 lendo fixtures | **NOT RUN / NO-GO** |
| Broker GET-only mTLS, `follow=true` em rede e identidade/ledger | **NOT IMPLEMENTED** |
| Publicar qualquer workflow em `main` | **BLOCKED — autorização explícita separada** |
| Docker mutante, imagem, container, Vector real | **BLOCKED — outra autorização explícita** |
| EXATA Windows / HML / produção | **NO-GO / intocados** |

**Próximo passo de engenharia:** validar com evidência as diferenças entre os campos projetados no normalizador R7B e os campos que `bollard::service::ContainerInspectResponse` efetivamente consegue desserializar; preparar contratos HTTP/streaming/mTLS sem executar rede até gates próprios.
