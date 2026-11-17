# EXATA R7B-G1B8 — Preflight estático para desserialização Rust/Serde (sem Docker)

**Data:** 17/11/2026. **Governança:** [EXATA #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Laboratório independente:** [PR Draft #28](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/28), repo `hlxdnapp1/f5-vector-docker-synthetic-lab`.

**Base protegida:** `main=af1a5bfd2e6ed753fb68f4622e893947a9dab919`. **Commit anterior do Draft:** `b257086a8ddaf2278a4edf2e7a25379c76cbcd78`.

## 1. O que a fonte oficial estabelece

Vector v0.53.0: `vectordotdev/vector`, commit **`2b51b40a7a0b40996350d73cf46791c7e991fcb6`**, `Cargo.toml` blob `abcf19f71e83dfa3c28ed2287918c7bebb68c783`, `Cargo.lock` blob `9f981864e8fae195b49a1c61ed388c399603b570`.

A dependência Vector resolve `bollard=0.19.2`, `bollard-stubs=1.49.0-rc.28.3.3`, `chrono=0.4.41`, `serde_json=1.0.145`. O `Cargo.toml` do Vector habilita `bollard` com features `pipe`, `ssl` e **`chrono`**; isto importa porque `BollardDate` nos stubs é `chrono::DateTime<Utc>` com a feature `chrono` habilitada, em vez de `String` como seria sem `chrono` ou `time`.

Fonte dos modelos: `fussybeaver/bollard` tag `v0.19.2`, commit **`5e83c3d9e489f115d3e4ae8f5f4c70eb38d1ba21`**, `codegen/swagger/src/models.rs` blob **`199da7631a06db8f62c6facab9a71edb0ee8f50a`**, licença stubs **Apache-2.0**. Vector declara **MPL-2.0**. Nenhum código de terceiros foi copiado.

## 2. Arquivos novos do G1B8

1. `rust/r7b-bollard-serde-probe/Cargo.toml`: crate **não publicável**, sem cliente Docker, com as três dependências diretas fixadas nas versões exatas acima e feature `chrono` dos stubs.
2. `rust/r7b-bollard-serde-probe/tests/serde_models.rs`: **12 testes Rust preparados**, com os tipos **reais** `bollard_stubs::models::{ContainerSummary,ContainerInspectResponse}` e `chrono::DateTime<Utc>`. Cobre lista/inspeção fictícias, nanossegundos distintos, campos necessários, `Option::None` nos campos ausentes, timestamps inválidos, campos extras ignorados por Serde e ID estrangeiro não autorizado por Serde. Todos os IDs e metadados são públicos e sintéticos.
3. `tests/r7b-bollard-serde-scaffold.test.mjs`: **16 testes estáticos Node** executáveis imediatamente, verificando dependências, modelos pretendidos, testes negativos, isolamento de rede/Docker e ausência de `Cargo.lock`.

**Limite de segurança:** não há acesso a `Docker::connect_with_*`, host Windows, TCP 2375, daemon, containers, rede, arquivos comerciais, certificados ou operações fiscais. O Rust probe, quando puder ser compilado, será **somente desserialização de objetos JSON sintéticos em memória**.

## 3. Evidências executadas agora

Diretório temporário novo e isolado `/mnt/data/exata_r7b_g1b8_serde_offline_20261117`; Node **v22.16.0**, Git local disponível. GitHub DNS inacessível no shell; GitHub foi consultado e alterado por conector autenticado. Nenhum `git clone` de rede foi simulado.

```sh
node --check tests/r7b-bollard-serde-scaffold.test.mjs
node --test --test-reporter=tap tests/r7b-bollard-serde-scaffold.test.mjs
```

**PASS: 16/16 verificações Node estáticas**, 0 failed, 0 skipped/cancelled.

| Arquivo G1B8 | Git blob SHA-1 local validado também pelo GitHub | SHA-256 local |
| --- | --- | --- |
| `rust/r7b-bollard-serde-probe/Cargo.toml` | `5750340dcef6fd45e547dc5ef4977d7c1d429542` | `ae237cabba582729795a6220d316832f65271b712d1ea9d76d9dff5f702b1049` |
| `rust/r7b-bollard-serde-probe/tests/serde_models.rs` | `64ebb92d57eb572b0463845e139aea77b5790a79` | `c287329c4306b7d8a74e915e7f53009a34b19938ed039a6fc2f307e54c819bed` |
| `tests/r7b-bollard-serde-scaffold.test.mjs` | `28ad8d52f347036148e9d702d6c16d859c9f7cfb` | `76099c2b9c5b225fa85c31d4d68774c1ac2fa238d19274811ac5a601661c7397` |

Relatório TAP local SHA-256: `4b1dc426619988423ea790f1459a7f7e91d06e3b310a6d75e4516833c20c1a48` (não publicado como Actions artifact).

## 4. Gate Rust ainda bloqueado — sem falsa aprovação

O ambiente atual **NÃO possui `cargo`, `rustc` ou `rustup`**. Também **NÃO existe `Cargo.lock` gerado/verificado para esse novo crate isolado**, e o cache de dependências do Cargo não está disponível. Portanto:

- Os **12 testes escritos em Rust NÃO foram compilados nem executados**; não alegar PASS, não chamar o projeto de compatível com Serde até evidência de `cargo test`.
- As dependências **diretas** estão fixadas, porém a árvore **transitiva** do novo crate não tem lock e hashes homologados; não alegar reprodução integral dos binários.
- Não instalar Rust nem buscar crates/imagens neste gate; nenhuma execução GitHub Actions foi autorizada para G1B8.
- Num ambiente descartável futuro com ferramentas aprovadas, primeiro gerar/auditar `Cargo.lock` com checksums, depois executar **`cargo test --locked --offline`**, validar os hashes e registrar resultado. Qualquer dependência ausente ou falha de Rust deve resultar em **BLOCKED/FAIL**, sem fallback para Docker real ou produção.
- O Serde por si só **não é filtro de autorização**: campos adicionais podem ser ignorados; o normalizador/allowlist R7B continua responsável por recusar dados/identidades não autorizados.

## 5. Governança

| Gate | Estado |
| --- | --- |
| R7B-G1B7 — preservação de RFC3339Nano nos módulos JS | **PASS offline, 122/122 relevantes (rodada anterior)** |
| R7B-G1B8 — verificação estática do novo scaffold | **PASS Node, 16/16** |
| R7B-G1B8 — compilação e 12 testes Rust reais | **BLOCKED: ferramentas/lock indisponíveis** |
| G1C — publicar/merge em `main` | **BLOCKED: autorização específica do proprietário** |
| G1D — criação/alteração de containers/imagens Docker | **BLOCKED: autorização separada** |
| Vector real, mTLS, `follow=true` de rede | **NO-GO** |
| EXATA Windows, HML, produção | **NO-GO / intocados** |

**Decisão:** aceitar apenas o avanço de pesquisa/engenharia no PR Draft, preservar todos os gates e não promover esta preparação como homologação real do Bollard.
