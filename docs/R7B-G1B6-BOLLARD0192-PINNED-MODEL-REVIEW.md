# EXATA R7B-G1B6 — Bollard 0.19.2 / stubs 1.49.0-rc.28.3.3: metadados do Vector (OFFLINE DRAFT)

**Data:** 17/11/2026. **Governança:** [EXATA #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Repositório:** [f5-vector-docker-synthetic-lab](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab), [PR Draft #28](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/28).

**Base imutável:** `main=af1a5bfd2e6ed753fb68f4622e893947a9dab919`. Escopo aprovado: pesquisa + código/teste offline em branch Draft somente. **Sem merge, dispatch, Docker daemon, imagem, container, Vector real, mTLS, SQL, Windows, HML ou produção.**

## 1. Versões verificadas na fonte principal

Fonte [vectordotdev/vector](https://github.com/vectordotdev/vector) tag `v0.53.0`, commit **`2b51b40a7a0b40996350d73cf46791c7e991fcb6`**, `Cargo.lock` blob **`9f981864e8fae195b49a1c61ed388c399603b570`**:
- `bollard = 0.19.2` (resolução efetiva; `Cargo.toml` expressa `0.19.1` com caret sem pin exato);
- `bollard-stubs = 1.49.0-rc.28.3.3` (resolução efetiva);
- `Cargo.toml` do Vector declara **MPL-2.0**, e o pacote `bollard-stubs` pesquisado declara **Apache-2.0**. As referências são para estudo, sem importação de código.
- Código `docker_logs`: `src/sources/docker_logs/mod.rs`, blob **`45268788d45cc869f36b34d9b9791c05cd7b3e83`**.

Fonte [fussybeaver/bollard](https://github.com/fussybeaver/bollard/tree/5e83c3d9e489f115d3e4ae8f5f4c70eb38d1ba21), tag `v0.19.2`, commit **`5e83c3d9e489f115d3e4ae8f5f4c70eb38d1ba21`**:
- `codegen/swagger/Cargo.toml` declara pacote `bollard-stubs` **`1.49.0-rc.28.3.3`**;
- [`codegen/swagger/src/models.rs`](https://github.com/fussybeaver/bollard/blob/5e83c3d9e489f115d3e4ae8f5f4c70eb38d1ba21/codegen/swagger/src/models.rs), blob **`199da7631a06db8f62c6facab9a71edb0ee8f50a`**, contém os modelos Serde de `ContainerSummary`, `ContainerInspectResponse`, `ContainerConfig` e `ContainerState`;
- `ContainerInspectResponse.created` tem tipo `Option<BollardDate>`, com `deserialize_timestamp`; `name` é `Option<String>`, `config` é `Option<ContainerConfig>`, `Config.image` e `Config.labels` são opções; `ContainerSummary.id` e `names` também são opcionais no modelo.

**Risco concreto no Vector v0.53.0:** o código de `docker_logs` usa `.unwrap()` para o ID e Names na resposta LIST, e para `config`, `name`, `created` e `config.image` na resposta INSPECT. Portanto, apesar de opcionais no modelo do Bollard, são **campos de presença obrigatória para este caminho do Vector**. Não publicar respostas sintéticas com qualquer um deles ausente.

## 2. Novo contrato sintético e prova offline

`src/r7b-bollard0192-fixture.mjs` constrói buffers JSON **somente com identidade pública fictícia** (`a*64`, digest `b*64`, image config `c*64`, labels de laboratório). A fixture preserva literalmente a data `Created` de INSPECT no formato UTC RFC3339 com até nove casas fracionárias; LIST recebe `Created` em segundos inteiros. Campos de Vector presentes: `Id`, `Names`, `Name`, `Created`, `Config.Image` e `Config.Labels`. Não aceita entrada Docker nem possui import, socket, cliente de rede, filesystem ou operações sobre host.

`tests/r7b-bollard0192-fixture.test.mjs` verifica shape, separação `Image` (config ID) vs `Config.Image` (referência/tag), metadados opcionais obrigatórios para Vector, nanossegundos exatos, timestamps inválidos, ausência de credenciais, imutabilidade de buffers entre chamadas e falta de I/O.

**Comandos locais efetivamente executados** (Node **v22.16.0**, diretório isolado `/mnt/data/r7b_g1b6_bollard0192`):
```sh
node --check src/r7b-bollard0192-fixture.mjs
node --check tests/r7b-bollard0192-fixture.test.mjs
node --test --test-reporter=tap tests/r7b-bollard0192-fixture.test.mjs
```

**RESULTADO NOVO: 33/33 PASS, 0 falhas.** `tests.tap` (somente local) SHA-256 **`952cffc4a9f88833e49bb00e7ed80cfa741a6ad45575924ec23dfa4b63cfab51`**.

| Arquivo | Git blob SHA-1 confirmado via GitHub após upload | SHA-256 do arquivo local testado |
| --- | --- | --- |
| `src/r7b-bollard0192-fixture.mjs` | `4ee6d2950b61d282d5e22537ef4f3d1efdd59c03` | `abf178b4570a0b051758ab98dee7c0d19e77644d4001dd4cec24b553d372fe82` |
| `tests/r7b-bollard0192-fixture.test.mjs` | `a75b5665ed6cfad2f638e3dda772c9c3682d3872` | `07afdd5d32cd98cf9bb8c47b7225ea2cf33632924d1d71b2b1a673897b32f3e3` |

**Verificação distinta:** o normalizador anterior `src/r7b-offline-docker-api-normalizer.mjs` (Git blob `b3ee03c4e742fe2919d03fc7d6c9b5cb5360e701`) projeta `Created` usando `new Date(created*1000).toISOString()`, o que **apaga frações de segundo** mesmo quando a entrada INSPECT tinha nanossegundos. É uma perda de fidelidade por inspeção do código, **não uma falha do presente teste**. A correção futura exige novo gate de mudança mínima, testes de regressão com o normalizador anterior e validação do comportamento necessário ao Vector; neste incremento nenhum arquivo anterior foi modificado.

**Nenhum teste Rust `serde_json::from_slice::<ContainerInspectResponse>` foi executado:** Rust/Cargo não estão disponíveis no runtime local, e as dependências do registry não foram baixadas. Logo a fixture é *compatível por análise de campos e tipos*, **não comprovadamente desserializada pelo Bollard real**. Não declarar integração Vector, mTLS, stream `follow=true`, conta de tenant, ledger de containers ou recuperação dos dois Vector no Windows.

## 3. Gates

| Gate | Status |
| --- | --- |
| R7A-G0C — Docker Engine READ-ONLY GitHub-hosted | PASS anterior, run #44005248638 attempt 2 |
| R7B-G1B–G1B5 | PASS histórico offline (172 testes somados de rodadas distintas) |
| R7B-G1B6 — fixtures com modelo Bollard pinado | **PASS OFFLINE NOVO: 33/33** |
| Execução conjunta de todas as suítes neste commit | **NOT RUN** |
| Desserialização real por Bollard 0.19.2 / stubs 1.49.0-rc.28.3.3 | **NOT RUN / NO-GO** |
| R7B-G1C — publicar código/workflow em main | **BLOCKED: autorização específica do proprietário** |
| R7B-G1D — Docker mutante/containers | **BLOCKED: autorização distinta** |
| Vector real + mTLS + logs `follow=true` | **NOT IMPLEMENTED / NO-GO** |
| EXATA Windows / HML / produção | **NO-GO / intocados** |

**Próxima ação permitida:** adicionar testes de regressão offline que atravessem o normalizador anterior e estas novas fixtures, preservando precisão/identidade sem expor dados reais; só depois considerar publicação/execução sob novos gates.
