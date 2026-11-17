# EXATA R7B-G1B9 — tentativa de prover ambiente Rust isolado (BLOCKED)

**Data:** 17/11/2026. **Governança EXATA:** [issue #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Laboratório independente:** `hlxdnapp1/f5-vector-docker-synthetic-lab`, [PR Draft #28](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/28).

**Base protegida:** `main=af1a5bfd2e6ed753fb68f4622e893947a9dab919`. **HEAD de entrada:** `d51cf9360597715238d76ca0b0b7a56d033a97e6`. Somente Draft, sem merge, dispatch, workflow, Docker real, banco ou acesso Windows/EXATA/HML/produção.

## 1. Tentativa real e bloqueios de infraestrutura

A execução foi tentada diretamente no runtime Linux descartável desta conversa, em pasta isolada `/mnt/data/exata_r7b_g1b8_serde_offline_20261117` com arquivos G1B8 efetivos, não somente um plano.

- `git` e `node v22.16.0` presentes; `cargo`, `rustc`, `rustup` e `docker` **ausentes**.
- `curl` a `github.com`, `static.rust-lang.org` e `index.crates.io`: falha DNS `curl: (6) Could not resolve host`. Download de toolchain oficial também não foi obtido. Nenhum instalador não verificado, mirror arbitrário, serviço pago ou bypass de rede foi usado.
- Não há `Cargo.lock` aprovado para o crate isolado G1B8 nem cache de dependências Cargo. Logo não existe ambiente executável capaz de compilar os 12 testes Rust sob `--locked --offline`.
- **O usuário autorizou tentar criar o ambiente descartável**. Essa autorização não foi interpretada como liberação dos gates anteriores que exigem permissão específica para merge, publicação de workflow e Docker mutante.

## 2. Entrega incremental em branch Draft

Arquivo novo: `rust/r7b-bollard-serde-probe/RUN-ISOLATED-OFFLINE.sh` (somente Bash; não instalado e não executado fora do laboratório).

- Verifica hashes Git dos arquivos G1B8 `Cargo.toml` e `tests/serde_models.rs`, sem tocar em Docker.
- Exige sinalizador explícito `R7B_RUST_OFFLINE_APPROVED=1`.
- Bloqueia sem `rustc` e `cargo`; não faz instalação automática.
- Bloqueia sem `Cargo.lock` preexistente e sem hash SHA256 revisado `R7B_APPROVED_LOCK_SHA256`.
- Exige `R7B_APPROVED_CARGO_HOME` absoluto, isolado, pré-populado, não compartilhado com `$HOME/.cargo`; `CARGO_NET_OFFLINE=true`.
- Usa `cargo test --locked --offline` e `CARGO_TARGET_DIR` temporário, removido ao sair. Erro interrompe imediatamente. **Nenhum script toca em produção nem pode ativar um daemon.**

## 3. Evidências verificáveis

**Validação local observada:**

- Fonte G1B8 `Cargo.toml`: blob Git `5750340dcef6fd45e547dc5ef4977d7c1d429542`, confirmado localmente.
- Fonte G1B8 `tests/serde_models.rs`: blob Git `64ebb92d57eb572b0463845e139aea77b5790a79`, confirmado localmente.
- `bash -n RUN-ISOLATED-OFFLINE.sh`: **PASS**.
- Execução sem sinalizador: **código 42**, mensagem `BLOCKED ... explicit offline-execution flag missing`.
- Execução com `R7B_RUST_OFFLINE_APPROVED=1`: **código 42**, mensagem `BLOCKED ... rustc unavailable; no installation attempted`. Pré-check de hashes: PASS. Nenhum comando `cargo test` iniciado.
- Rerun do teste estático G1B8 `node --test --test-reporter=tap tests/r7b-bollard-serde-scaffold.test.mjs`: **16/16 PASS**, zero falhas.
- Script novo Git blob `3ebd5bdd803e19d384f24fe9f48ff33e02fef276`, SHA256 local `533441443319940cbdc6555b6f7f0f65bb856c4d8b8576f608216c5ceb030ca4`; bytes no GitHub conferidos contra arquivo local executado.
- Log da segunda tentativa SHA256 local `88800808989b1d9e7d9e4148150adb8817634d00b03fe81172f07a30cc36e7aa`.
- Nenhum artefato de build Rust real foi produzido.

## 4. Gates e próximos passos sem atalhos

| Gate | Status |
|---|---|
| G1B8 preflight estático Node | **PASS 16/16**, reexecutado |
| G1B9 Bash syntax e hashes de fonte | **PASS** |
| G1B9 comportamento fail-closed sem pré-requisitos | **PASS**, dois cenários retornaram 42 |
| Provisionamento de `cargo`, `rustc`, cache e `Cargo.lock` | **BLOCKED: sem rede e ferramentas** |
| Compilação e 12 testes Rust/Serde real | **NOT RUN / BLOCKED** |
| Merge/publicação workflow G1C | **BLOCKED: aprovação específica** |
| Docker mutante/Vector real G1D, mTLS, `follow=true` | **NO-GO / aprovação separada** |
| EXATA Windows/HML/produção | **INTACTOS / NO-GO** |

**Alternativa para desbloquear:** usar um executor Linux descartável com Rust e dependências acessíveis (por exemplo, GitHub-hosted Actions), **após aprovação específica do novo gate de execução/publicação de workflow**, gerar e auditar o `Cargo.lock` transitivo e executar os 12 testes exclusivamente in-memory, sem Docker. Não inventar PASS de Rust a partir de preflight Node.
