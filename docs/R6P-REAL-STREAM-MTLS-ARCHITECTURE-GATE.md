# EXATA R24-03W R6P — Gate arquitetural de streaming Docker/Vector com HTTPS mTLS (REVISÃO SOMENTE)

**Data:** 16/11/2026. **Governança:** [EXATA #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Repositório público isolado:** `hlxdnapp1/f5-vector-docker-synthetic-lab`. **Base imutável:** R6O, branch `review/r6o-vector-offline-ndjson-mux-session-20261116`, commit `9960c6788de658bb8abf68482787d48edb8eed3d`.

## 0. Evidência recebida e escopo autorizado

O proprietário confirmou R6O no Windows: **Node R6B–R6O 227/227 PASS offline**, em clone novo, com verificações de GitHub/commit/hashes/diff/sintaxe PASS. Relatório local `R24_03W_R6O_RESULT.json`, SHA-256 informado `7A52A578699A3BB6370FB32727454698D2C4E7EEB688CAE059FD6E4C1F73CD44`. Os bytes do relatório Windows não foram recebidos pelo revisor e seu hash não foi recalculado independentemente. GitHub Actions, Docker/Vector reais, HML e produção **não executados**. R6O **PASS_OFFLINE_ONLY**; runtime real **BLOCKED**.

Autorização herdada: preparar/revisar exclusivamente em nova branch e PR **Draft** do laboratório público. Não alterar arquivos de produção, workflows, branch `main`, PRs anteriores, EXATA principal, Docker Desktop/WSL, serviços existentes, Docker Engine/Unix socket reais, certificados reais, SQL, fiscais ou HML. Nenhuma execução GitHub Actions, merge ou deploy.

## 1. Confronto de contratos: a simulação não é o transporte real

| Fronteira | Evidência verificável no código R6O | Lacuna de runtime |
| --- | --- | --- |
| R6N `planR6NVectorGet` | Plano **inerte** gera GET sintético LIST, INSPECT, EVENTS e LOGS; EVENTS `until=0`, LOGS `follow=true`. | Não faz I/O, não serve conexão HTTP, não prova que Bollard/Vector aceitará resposta ou reconexão. |
| R6O `R6OOfflineScenario` | Emite JSON, NDJSON e frames mux sob demanda de arrays fake; one-shot; pré-validação completa. | Fonte finita em memória; não há upstream Docker, HTTPS, HTTP chunked, long polling, backpressure de socket nem cancelamento de rede. |
| R6F `planLabRead` | Reescreve LOGS para `follow=false&tail<=100`; limita EVENTS a `until=now+2`; usa buffer atômico. | **Incompatível com a coleta contínua** exigida pelo R6N/Vector. Não alterar R6F sem testes novos e revisão. |
| R6G `executeR6GAttestedRead` | Inspeciona antes/depois da leitura, exige prova sintética e retorna `body:Buffer`. | Requer buffer final e pós-inspeção: impossível manter `follow=true` infinito no mesmo modelo; falta revalidação e revogação durante stream. |
| R6G `makeR6GLoopbackGateway` | HTTPS mTLS TLS 1.3, peer fingerprint, GET restrito; `Content-Length`, `Connection:close` e resposta de até 32768 bytes. | Só resposta finita; não oferece `Transfer-Encoding: chunked`/drenagem/aborto upstream. `127.0.0.1` do host **não é automaticamente** acessível dentro de um container com namespace de rede separado. |
| Docker Engine API 1.44 | GET `/events` é fluxo de objetos; GET `/containers/{id}/logs?follow=true` é fluxo de frames mux para container TTY=false. | O endpoint Docker `logs` **não garante Content-Type**. Não usar header inventado como prova de compatibilidade. |
| Vector `docker_logs` | Documenta `docker_host=https://...` e material TLS `ca_file/crt_file/key_file`. | Configuração precisa de SAN/SNI verificável e caminho de rede funcional do processo Vector ao gateway; certs nunca no Git. |

Fontes técnicas: [Vector v0.53.0 fonte fixada](https://github.com/vectordotdev/vector/blob/v0.53.0/src/sources/docker_logs/mod.rs) (commit `2b51b40a7a0b40996350d73cf46791c7e991fcb6`, blob `45268788d45cc869f36b34d9b9791c05cd7b3e83`), [Vector docker_logs — configuração TLS](https://vector.dev/docs/reference/configuration/sources/docker_logs/), [Docker Engine API v1.44](https://docs.docker.com/reference/api/engine/version/v1.44/). Antes de teste real, confirmar comportamento no **binário oficial exato** da versão pinada.

## 2. Decisão R6P: separar arquitetura de aprovação operacional

**R6P é uma revisão de lacunas, não uma implementação de proxy real.** Não converter os métodos fake de R6O em transporte externo nem acoplar R6O ao servidor R6G por simples import: falta preservar as garantias de identidade, escopo e falha segura durante o streaming.

Arquitetura candidata, SEM autorização de ativação:

1. **Controlador do runner** (fora do Vector): único detentor da capacidade privilegiada de Docker; provisiona apenas contêineres descartáveis sintéticos, digest de imagem pinado e um ledger de IDs/nonce/run antes de qualquer mutação. A posse de labels/variáveis `GITHUB_*` não atesta criptograficamente o daemon nem a VM.
2. **Transportador GET Unix segregado**: somente paths gerados por allowlist, contra daemon comprovadamente exclusivo/efêmero do runner; sem encaminhar URL arbitrária; sem credenciais, `POST`, `DELETE`, `exec`, `attach`, `prune`, writes ou socket acessível ao Vector.
3. **Gateway HTTPS/mTLS de leitura**: autenticação mutuamente validada (CA, fingerprint, SAN do servidor, nome usado pelo cliente, validade, revogação por sessão); HTTP/1.1 estritamente GET; LIST/INSPECT em buffer pequeno e completo; EVENTS/LOGS como **streams distintos** com sanitização incremental, quotas e cancelamento bilateral.
4. **Vector oficial**: consumidor sem socket Docker e sem credenciais de controlador; configuração pinada de `docker_host` e TLS, sink de prova restrito a dados fictícios e sem egress não autorizado; comportamento real de Bollard ainda não demonstrado.
5. **Topologia**: a conexão deve ser provada *do namespace de rede do próprio Vector ao endereço TLS certificado*. A escuta `127.0.0.1` num host não serve por si só a um container separado. Não liberar `0.0.0.0`, rede host, bind TCP sem TLS ou exposição pública como atalho. Sem topologia isolada e comprovada, **NO-GO**.

## 3. Contrato mínimo futuro da camada de streaming

- **Autorização antes do primeiro byte**: runner/daemon independente, único ID completo, nonce/run/labels/digest recentes, inspecionados pelo controlador; LIST/INSPECT projetados sem dados privados de upstream. Um `INSPECT` inicial não é autorização vitalícia.
- **EVENTS**: tratar NDJSON com delimitador real de newline e UTF-8 estrito; validar cada linha completa, incluindo `Type`, `Action`, `Actor.ID` e atributos necessários à versão fixada. Rejeitar outsiders e qualquer evento inconsistente **sem repassar a linha**. Validar fragmentação de um byte e múltiplas linhas em um chunk.
- **LOGS**: `follow=true`, `stdout/stderr=true`, `timestamps=true`, TTY=false; decoder incremental dos 8 bytes de cabeçalho e payload, com tamanho máximo; somente linhas sintéticas RFC3339Nano e canais permitidos; nenhum frame parcial/malformado sai. Nunca propagar erro upstream bruto, Env/paths/IDs/labels privados.
- **Fluxo**: `res.write()===false` tem de suspender a leitura upstream até `drain`, com limites de buffer, heap, frames e bytes, timeout absoluto e de inatividade, aborto do consumidor que efetivamente destrua/aborte upstream. Comprovar `close`, `error`, `end`, `aborted`, reconexão e teardown. A prova de R6O sobre ausência de *prefetch fake* não comprova isso na rede.
- **Inspeção durante sessão**: estado de autorização vinculado à conexão; revalidar identidade por mecanismo independente, com política de rechecagem que não bloqueie o fluxo e feche imediatamente em divergência. A regra R6G de inspeção **pós-resposta** não se aplica a stream indefinido. Se não houver estratégia verificável, não transmitir.
- **Janela limitada**: apesar de `follow=true`, sessões de ensaio devem possuir limites e desligamento controlado; no rejoin, estabelecer semântica comprovada de `since`, duplicações e lacunas. Nunca alegar entrega exactly-once sem evidência.
- **Headers HTTP**: para streams, não definir `Content-Length` de buffer fechado; o Docker pode omitir `Content-Type` em logs. Compatibilidade real será julgada pelo parser do Vector/Bollard e pelas provas de payload, não pelo header sintético de R6O.

## 4. Gates de decisão: nenhum é implicitamente aprovado pelo R6O

| Gate | Prova exigida | Situação em R6P |
| --- | --- | --- |
| D0 — projeto isolado | Branch R6P derivada do R6O; diff apenas documental; nenhum workflow modificado | A verificar após publicação |
| D1 — protocolo | Casos de teste offline de cancelamento/socket, NDJSON, mux, quotas e revalidação no futuro adaptador | **BLOCKED**: ainda não implementado/testado |
| D2 — topologia/TLS | Mapa de namespaces, DNS/IP, SAN, handshake Vector real, principal de rede isolado | **BLOCKED** |
| D3 — identidade/limpeza | Runner e daemon independentes; dois containers sintéticos, ledger durável, cleanup exato, rollback, outsider preservado | **BLOCKED** |
| D4 — CI de leitura real | Aprovação específica de workflow em `main` do **laboratório público**; novo gate independente para job Docker/Vector real | **NÃO AUTORIZADO / NOT_RUN** |
| D5 — Windows HML | Backup e plano de reversão, baseline de saúde dos oito serviços protegidos, janela e aprovação independentes | **NO-GO** |
| D6 — produção | Mudança fiscal/operacional com gates e autorização próprios | **NO-GO** |

**R6Q proposto (somente branch Draft, se mantido o escopo autorizado):** criar um **adaptador de protocolo e fluxo injetável em memória** com testes de streams reais do Node *dentro de processo isolado*, sem socket Docker e sem nova ligação operacional ao EXATA; exercitar `backpressure`, aborto propagado, deadlines, NDJSON/mux e rotação de identidade. NÃO rotular esses testes como Vector/Docker reais. R6R dependerá de revisão independente dos gates D1–D3.

## 5. Resultado deste marco

- **R6O:** 227/227 PASS (relatado pelo proprietário; offline).
- **R6P:** **REVIEW_DOC_ONLY**. A publicação da branch/PR Draft e diff serão verificados separadamente. Sem novos testes Node necessários para um único arquivo Markdown; o histórico 227/227 não é reapresentado como execução R6P.
- **Vector/Bollard real e daemon Docker:** BLOCKED / NOT_RUN.
- **GitHub Actions:** NOT_RUN. **Main:** intocada. **EXATA Windows/HML/produção:** NO-GO.
