# EXATA R24-03W R6O — Integração de sessão Vector 0.53.0 com fonte inteiramente FICTÍCIA

**Data:** 16/11/2026. **Governança:** [issue EXATA #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Repositório público isolado:** `hlxdnapp1/f5-vector-docker-synthetic-lab`.

## Escopo autorizado e baseline

O proprietário solicitou **continuar**, mantendo a autorização existente para **desenvolver, testar e revisar somente numa branch/PR Draft isolada**. NÃO executar GitHub Actions, merge, Docker Engine, imagens/containers reais, Windows HML, SQL, fiscal ou produção.

Base R6N: PR Draft #13, branch `review/r6n-vector-v053-contracts-offline-20261116`, commit **`472366da40357b5a357b31dee3d7f72dc3740c89`**, proprietário confirmou **203/203 PASS offline** em clone Windows; relatório `R24_03W_R6N_RESULT.json` com SHA-256 informado **`37099A048FA7E68B2404F1D0BE178473EAC4009F9323A5DAE240DAEDF5F9B0E0`**. O relatório não foi disponibilizado em bytes para recálculo independente. Branch pública `main` permanece `72775463905e9f81730f8f8bb5e5c054f136e6ff`, sem execução de workflows.

Referência externa fixa: `vectordotdev/vector` tag **`v0.53.0`** (objeto tag `ed2635593b5a6641735accae8e9c94c5dade52c9`, commit `2b51b40a7a0b40996350d73cf46791c7e991fcb6`), `src/sources/docker_logs/mod.rs` blob `45268788d45cc869f36b34d9b9791c05cd7b3e83`. A fonte oficial realiza listagem/inspeção e usa `Actor.Attributes`, `follow=true`, `since` e timestamps. Fonte: https://github.com/vectordotdev/vector/blob/v0.53.0/src/sources/docker_logs/mod.rs .

## Novos arquivos do R6O

1. `src/r6o-offline-vector-session.mjs`: **somente Node ESM com 2 imports locais** de R6N e R6L; nenhum I/O, HTTP(S), socket, TLS, daemon Docker, filesystem ou processo externo. A classe `R6OOfflineScenario` recebe somente arrays/objetos de teste sintéticos em memória. Antes de emitir qualquer byte, valida um container autorizado de `LIST`, `INSPECT` e todos os eventos do cenário usando o contrato R6N; recusa nomes/labels/ID/assinatura de imagem incongruentes, outsider e qualquer evento malformado. Cria a origem `OfflineR6LChunks` (fake privately branded) para logs.
2. `open(GET)` reconhece **somente** rotas aprovadas por `planR6NVectorGet`: `/_ping`, `/version`, `/containers/json`, `/containers/{alias}/json`, `/events`, `/containers/{alias}/logs`. `POST`, IDs estrangeiros, rota livre ou chamadas de mutação são negados. O resultado é um objeto JavaScript `{status,kind,stream,contentType,bytes()}`, **NÃO é um servidor HTTP** e não é uma resposta Bollard real.
3. Os bytes de `LIST`/`INSPECT` são JSON sintético com ID público artificial, sem IDs privados de upstream, Env, IP, paths, valores de terceiros ou atributos arbitrários. Eventos são objetos `Action`, `Actor.ID`, `Actor.Attributes.name` serializados em **NDJSON** com divisão controlada em blocos de 1–256 bytes e emitidos sob demanda. O cenário de eventos exige entre 1 e 16 eventos pré-validados. Fluxo é **finito** para o laboratório, mesmo que o plano do Vector seja aberto.
4. Logs usam o **R6K decoder via R6L fake pull relay**. Suportam frames Docker de 8 bytes fragmentados, canal stdout/stderr, timestamps UTC RFC3339Nano, `R6F_PUBLIC_SYNTHETIC_ONLY`, limite de 100 frames, 8 quadros pendentes, máximo de 512 chunks fake de 2048 bytes / 65536 bytes de entrada, re-encode sanitizado, negação de chunks malformados. A fonte fake não é consultada enquanto o consumidor está pausado num `yield`. O cenário não implementa nem finge que implementa `pause()/resume()` de rede.
5. `bytes()` é de uso único; os fluxos `EVENTS` e `LOGS` são abertos no máximo uma vez por cenário, evitando replay silencioso. `close()` encerra/zera a fonte fake. AbortSignal e deadline são verificados **cooperativamente** entre blocos; nenhum timeout consegue interromper rede porque **não há rede**. Falhas usam códigos categóricos `R6O_BLOCKED_*` sem refletir conteúdo bruto.
6. `tests/r6o-offline-vector-session.test.mjs`: **24 testes nativos Node** contra o conjunto R6N + R6L + R6K. Casos de sucesso LIST/INSPECT/PING/VERSION/NDJSON fragmentado/mux logs em fragmentos de 1 byte, falha de metadados e Actor.Attributes, ID outsider, canários secretos, não leitura antecipada, cancelamento/close durante log, quadros malformados, rejeição atômica dentro do mesmo chunk, erro posterior a quadro já consumido, one-shot/deadline e ausência de operações Docker/I/O.
7. Este documento. **Nenhum arquivo anterior é alterado; nenhum workflow é criado ou editado.**

## Evidência real executada no LAB local

- Node.js **v22.16.0**, `node --check` em todos os sources/tests locais: **PASS**.
- Foco R6O: **24/24 PASS** (0 fail, 0 skip, 0 cancel).
- Suíte local combinada **R6K + R6L + R6N + R6O: 96/96 PASS**; os testes anteriores R6B–R6J não foram reexecutados localmente nesta validação, mas foram homologados no Windows no commit pai R6N.
- Os arquivos de source/test R6O publicados devem ter os mesmos Git blobs que foram executados localmente. Não declarar completo antes da verificação da publicação.
- **Gate R6O combinado Windows: PENDENTE 227/227** (203 anteriores + 24 R6O), para clone isolado do commit exato publicado.
- Nenhum Vector 0.53.0 oficial, Docker Engine, GitHub Actions, imagens de registro, certificados ou container real foi iniciado.

## Bloqueios reais que persistem — fail-closed

- **NÃO é uma implementação de `follow=true`** no Docker Engine: o planner R6N descreve `follow=true` como dados inertes; o gateway R6F/R6G anterior continua fazendo `follow=false` e retornando conteúdo finito. R6O **não está ligado ao gateway R6G** nem recebe requisições reais do Vector/Bollard.
- A origem `OfflineR6LChunks` é explicitamente **fictícia**, rejeita streams externos. NDJSON e frames multiplexados são testados por métodos Node em memória, não num transporte HTTP chunked/reconexão TLS.
- Um quadro sintético válido **já consumido** não pode ser revogado quando um chunk posterior falha. Atomicidade entre respostas de streaming sem fim não é prometida. Aborto/deadline são cooperativos e não interrompem sockets travados; em execução real exigiriam timeouts externos, mTLS, controle real de buffer, integração de `AbortSignal`, isolamento da origem e proteção contra vazamento.
- A estrutura JSON é baseada nos campos consultados pelo Rust Vector 0.53.0, mas **nenhum parser Bollard/Rust foi executado**. A compatibilidade end-to-end ainda é BLOCKED.
- Proveniência de runner efêmero/daemon, digests reais, isolamento dos privilégios, certificação SAN/fingerprint do mTLS, ledger durável/exact-ID cleanup e rollback de containers ainda não foram demonstrados. A hipótese histórica `host.docker.internal:2375` do Windows segue **não comprovada como causa raiz**, e é proibido habilitar HTTP Docker sem TLS.

## Gates operacionais independentes

1. Validar GitHub R6O HEAD/branch/base/blobs/diff/sem workflow e native Node **227/227** em clone novo no Windows.
2. Revisar design de adaptador HTTPS/mTLS e stream real sob `follow=true` com NDJSON, mux, cancelamento de socket, timeouts/quotas, sem qualquer escrita do Vector.
3. Aprovação **separada** para eventual alteração de workflow na `main` do laboratório público.
4. Aprovação **separada** para primeiro job real Docker Linux em runner GitHub-hosted efêmero, com imagem pinada, controlador com socket segregado, conta limitada, ledger + cleanup exato e prova de inexistência de outsiders.
5. Homologação HML no Windows **independente**, protegendo os oito serviços; produção com autorização/backup/rollback próprios.

**Estado:** R6N **PASS 203/203 Windows OFFLINE**; R6O **PASS 24/24 focado local / 96/96 locais agrupados**, 227/227 Windows **PENDING**; Docker/Vector reais **BLOCKED**; Actions **NOT RUN**; HML/produção **NO-GO**.
