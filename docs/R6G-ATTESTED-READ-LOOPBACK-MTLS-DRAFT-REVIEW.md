# EXATA R24-03W R6G — Rascunho de identidade atual + mTLS em loopback (SEM Docker real)

**Data:** 16/11/2026. **Repositório:** `hlxdnapp1/f5-vector-docker-synthetic-lab` (público). **Governança:** [EXATA issue #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315).

**Autorização do proprietário para R6G:** somente preparar e revisar código em nova branch/PR Draft. **NÃO** fazer merge, disparar GitHub Actions, abrir daemon Docker real, criar/remover containers, acessar Windows/HML/SQL/fiscal/produção. O R6F homologado permanece em `41e61b0967dba9887eb6a1d2014ce969cf0ac9e2`; evidência Windows 58/58 PASS, relatório SHA-256 `DFA5DB97A852B99F8A6B4C01EF5C9F5ECE73FD3DDF66342F352C515542353B71`.

## Escopo de código acrescentado

1. `src/r6g-reconciled-read.mjs`: modelo de inspeção **antes e depois** de cada requisição permitida, usando um `fetchUpstream` injetado. Rejeita antes de qualquer GET se o gate R6F do runner estiver desativado ou a requisição for proibida. A inspeção exige ID completo de 64 hexadecimais, nonce efêmero de 32 hexadecimais, `Image=sha256:...` fixado por digest, nome e labels estritamente sintéticos, criação recente, usuário não-root, `NetworkMode=none`, rootfs read-only, `Privileged=false`, `CapDrop=ALL`, `no-new-privileges`, zero mounts/binds, limites CPU/RAM/PIDs, restart policy `no`, `AutoRemove=true`, estado `Running=true` e zero reinícios. A prova é obtida de **duas respostas simuladas de inspeção do transporte injetado**. Mudança de prova, tamanho excessivo, falha ou erro de transporte bloqueia a resposta. Não há leitura do Docker real nesta etapa.
2. O GET de dados é gerado pelo planejador R6F, conferido novamente por `isBoundedUnixGet`, **bufferizado** sob limites de bytes e sanitizado antes de ser liberado. O inspect R6G emite um objeto fictício fixo, distinto do identificador real; a implementação nunca reflete o JSON recebido.
3. `src/r6g-loopback-mtls-gateway.mjs`: preparação **não iniciada** de HTTPS/TLS 1.3 com certificados/CA entregues em memória pelo futuro lançador (sem arquivos PEM neste repositório). Usa `requestCert=true`, `rejectUnauthorized=true`, pin por fingerprint SHA-256 do certificado cliente, listener restrito a `127.0.0.1` e porta efêmera, somente GET, bloqueio de headers de proxy/autorização, limites para cabeçalhos e resposta. Somente `start()` explicitamente invocado poderia abrir listener; **nenhum workflow o invoca**. A porta não é pública.
4. `tests/r6g-reconciled-read.test.mjs`: 19 testes Node offline para autorizações, prova dinâmica, divergência antes/depois, projeção, limite de bytes e regras de TLS. Nenhum teste deste arquivo abre socket, cria containers, chama `docker` ou lê chaves.
5. Uma prova **adicional local, não versionada no GitHub**, gerou CA/servidor/cliente temporários via OpenSSL na área descartável do laboratório: HTTPS mTLS em loopback aceitou GET de cliente autorizado com **três respostas Docker simuladas**; cliente sem certificado não concluiu TLS; POST foi negado com **zero chamadas simuladas upstream**. Os certificados e chaves foram apagados após o teste. Essa prova não é compatibilidade com Vector real e não é uma execução do Docker.
6. `.github/workflows/r6f-offline-review-manual.yml` foi **preservado sem alterações**: continua apenas `workflow_dispatch` para testes Node offline, exclusivamente no PR Draft anterior. Nenhum workflow foi mesclado, habilitado ou executado.

## Resultado técnico e limites

- Base R6F: proprietário Windows **58/58 PASS** em `41e61b0967dba9887eb6a1d2014ce969cf0ac9e2`.
- R6G: novo conjunto Node **19/19 PASS** em laboratório local Node 22.16.0; suíte combinada R6B+C+D+F+G **77/77 PASS** no mesmo laboratório, sem conexão Docker. A execução independente em clone Windows do **commit R6G final** ainda é **PENDING**.
- Prova HTTPS/mTLS sintética local: **3 cenários PASS** (cliente autenticado, cliente sem certificado, POST negado). Nenhuma credencial do proprietário ou do EXATA utilizada.
- O teste de inspeção assume `fetchUpstream` confiável. Quem controla esse transporte ou o daemon ainda pode simular metadados; labels/nonce **não fornecem prova criptográfica** de independência do daemon. As variáveis `GITHUB_*` e `RUNNER_ENVIRONMENT` podem ser imitados fora do GitHub. Antes de uso real, a identidade do runner/daemon precisa de evidências independentes e de isolamento efetivo.
- O parâmetro `spec.nowSec` é fixado por chamador; o futuro runner deve usar relógio verificado da VM e não aceitar tempo ou nonce do cliente remoto.
- O modelo R6G ainda **não** provisiona a imagem digest-pinned nem containers descartáveis, não executa limpeza/rollback, não orquestra revogação/rotação de certificados e **não suporta streaming contínuo com backpressure**. O `follow=false` imposto pelo R6F permite apenas snapshots finitos e não comprova a coleta contínua esperada pelo Vector.
- O servidor mTLS não inicia sem gate explícito do runner R6F e sem material de certificado válido fornecido em memória. A prova do handshake de laboratório local não garante produção, integração com Vector real, nem endpoint remoto. A porta de loopback do host é acessível por processo local nessa mesma VM, mas exige certificado cliente válido; não deve ser exposta por encaminhamento público.
- O R6G não deve ser apontado a um daemon compartilhado ou ao `host.docker.internal:2375`; é **código candidato**, não uma recuperação do serviço original.

## Antes de qualquer Docker real — gates obrigatórios

1. Revisão independente do modelo de ameaças (identidade do runner, daemon Docker local, fonte do ID/nonce e digest e política de isolamento). Não aceitar prova de identidade baseada somente em variáveis de ambiente/labels.
2. Implementar **provisionador e teardown** de objetos somente sintéticos/digest-pinned em runner temporário, com fail-closed, checagem de propriedade e rollback por IDs criados; nenhum recurso do Windows/HML.
3. Validar transporte GET Unix e filtragem integral com **Docker API/streams reais** em runner hospedado, incluindo abortos, falta de chunks, timeouts, limites e nenhuma liberação de bytes antes da autorização. `tail<=100` é limite de snapshot, não solução de stream.
4. Criar fluxo de certificados mTLS efêmeros no runner, sem guardar segredos no repositório nem em logs, com limpeza e evidência de cliente desconhecido recusado.
5. Provar compatibilidade do **Vector oficial 0.53.0** com o endpoint e eventos/logs de longa duração; não declarar PASS com mocks.
6. Solicitar nova autorização explícita para qualquer alteração em `main`, disparo do GitHub Actions, instalação/uso de Docker real ou operações HML. A aprovação atual é exclusivamente para preparação offline.

## Status

| Gate | Resultado |
| --- | --- |
| R5N oficial Vector + Docker sintético | PASS (mock somente) |
| R6A inventário Windows | PASS readonly |
| R6B/C/D offline no Windows | PASS 37/37 |
| R6F offline no Windows | PASS 58/58 |
| R6G teste local offline | PASS 77/77 |
| R6G HTTPS/mTLS loopback com respostas sintéticas | PASS 3 cenários, local |
| R6G validação no Windows em commit publicado | PENDING |
| GitHub Actions ou Docker Engine real | NOT_RUN / BLOCKED |
| HML, Vector originais e produção | NO-GO |
