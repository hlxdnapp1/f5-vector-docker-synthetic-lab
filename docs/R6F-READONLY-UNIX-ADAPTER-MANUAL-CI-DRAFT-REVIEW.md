# R6F — Candidato de adaptador Docker Unix GET-only + workflow manual de revisão OFFLINE

**Data:** 16/11/2026. **Escopo autorizado:** preparar e revisar código na branch isolada e em PR Draft; **NÃO** executar o Docker real, GitHub Actions, merge, SQL, operações fiscais, HML, produção ou alterações no servidor EXATA.

## Base imutável

- Repositório público `hlxdnapp1/f5-vector-docker-synthetic-lab`, PRs Draft R6B #1, R6C #2, R6D #3 e R6E #4; R6E de partida commit `8eb8da49a9290b4083a78497343d0559f951a099`.
- R6D Windows do proprietário: commit `2355570ad5480a565d117f3825349be7329690b8`, **37/37 PASS**, relatório SHA-256 `157D001F1C4E7A2F71F95012B9CB333BA198946B26709E781D799A22C5DC398B`.
- Os dois Vector originais continuam contidos e oito serviços HML protegidos. Nenhuma causa raiz histórica definitiva identificada.

## O que foi preparado (somente Draft)

1. `src/r6f-real-docker-adapter.mjs`: **núcleo em memória** com plano GET fail-closed, identidade sintética **dinâmica** de 64 caracteres hexadecimais no lado daemon e ID público falso `a` repetido 64 vezes. Exige *attestation* de contêiner com rótulo `f5.synthetic.lab=R6F_ONLY`, nome `/r6f-synthetic-<8 caracteres>`, `Tty=false`, `NetworkMode=none`, `Privileged=false` e nenhum mount/bind; nega se falhar. LIST upstream inclui filtro por ID; EVENTS usa janela curta e filtro por ID; LOGS normaliza `follow=false` e `tail=all` para **GET efetivo `tail=100`**. Requisições não são repassadas diretamente; cada caminho upstream é construído de novo.
2. Respostas upstream são **bufferizadas e limitadas antes de qualquer saída**: no máximo 8–16 KiB por rota, 16 registros LIST/EVENTS, logs de no máximo 100 frames com header Docker de 8 bytes, UTF-8 estrito, timestamp UTC e **marcador artificial obrigatório** `R6F_PUBLIC_SYNTHETIC_ONLY`. LIST, INSPECT e EVENTS projetam apenas campos sintéticos fixos; IDs reais, labels, `Env`, IP, caminhos do host, contêineres outsiders e canários não aparecem nas respostas sanitizadas. Erros são categorizados sem refletir conteúdo bruto.
3. `src/r6f-unix-transport.mjs`: candidato **não acionado** para GET via `node:http` usando exclusivamente socket Unix `/var/run/docker.sock`. Só cria cliente se GitHub Actions `workflow_dispatch` em `refs/heads/main`, `RUNNER_ENVIRONMENT=github-hosted`, `RUNNER_OS=Linux`, repositório exato, SHA autorizado, autorização R6F separada e ausência de `DOCKER_HOST`/contextos/TLS remotos; valida socket tipo Unix. Mesmo após guard inicial, cada GET é conferido novamente por rota, ID, filtro e limite de bytes; timeout ~4,5 segundos; nenhuma operação POST, Docker CLI ou TCP.
4. `tests/r6f-real-docker-adapter.test.mjs`: 16 testes de segurança positivos/negativos com transporte injetado sintético; **nenhum socket real**.
5. `.github/workflows/r6f-offline-review-manual.yml`: **exclusivamente `workflow_dispatch`**, runner GitHub-hosted padrão `ubuntu-24.04`, token `contents: read`, checkout `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` fixado, `persist-credentials: false`, timeout 10 minutos, sem secrets nem recursos externos. **Esse workflow executaria apenas `node --test`**, não chama o adaptador e não contém Docker commands. A operação manual só pode ser disponibilizada caso o YAML seja posteriormente mesclado na `main`, o que NÃO está autorizado.
6. `tests/r6f-manual-workflow.test.mjs`: cinco testes estáticos do YAML; o antigo R6B-08 evoluiu **apenas nesta branch** de exigir 0 workflows para exigir **exatamente o manual R6F** e continuar bloqueando Dockerfile, .env, node_modules e diretórios extras.
7. `README.md`: esclarece que o `main` protegido mantém zero workflows e que o Draft agora contém um workflow inativo e código candidato de transporte.

## Evidência disponível de teste

- Node 22.16.0: R6F focado **16/16 PASS** (código local validado com os mesmos Git blob SHA-1 publicados no GitHub).
- Teste de workflow offline **5/5 PASS**.
- Em workspace local de testes com fixtures sintéticas e os arquivos aprovados do R6C/R6D, conjunto **58/58 PASS**, sem falhas ou skips. **Ainda falta execução integral independente no Windows no commit final**, para evidência auditável do proprietário.
- O YAML foi interpretado sintaticamente como dados; o parser PyYAML interpreta a chave `on` como boolean na convenção YAML 1.1, mas o GitHub Actions usa sua própria interpretação da chave `on`; nenhum workflow foi executado. Recomenda-se `actionlint` numa etapa futura se disponível, mas isso não altera os gates atuais.

## Limitações críticas e BLOCKERS antes de Docker real

**Este R6F NÃO é um proxy pronto para Vector.** Não existe servidor HTTPS/mTLS de escuta, cliente de integração completo, certificado efêmero, serviço de stream/backpressure, reconciliação de identidade com daemon em tempo real, criação idempotente de contêineres sintéticos por digest nem orquestrador de rollback. O transporte é **dormant**: nenhuma parte do workflow o invoca. Portanto a aprovação offline **não** comprova que o Docker Engine local de um runner hospedado aceita esses requests nem que o Vector 0.53.0 recebe logs reais. Não atribuir PASS a daemon real, streaming, custo de execução, recuperação dos Vector antigos ou produção.

Para um eventual R6G, antes da execução, exigir: código completo e revisão independente de API Docker real, identidade e isolamento do runner, imagens fixadas por digest e somente fictícias, comprovante de nenhuma fonte privada, mTLS com certificados efêmeros e identidade de cliente, streaming seguro com backpressure, filtros reais de response e eventos, read-only do adaptador, monitoramento limitado e *teardown* idempotente apenas de IDs novos. O simples uso de socket Unix fornece poder de administração sobre o daemon; só um runner inteiramente descartável e aprovado pode conter esse risco. O evento manual e a elegibilidade de gratuidade do runner não são autorização para executar.

**Governança:** [issue #315 do EXATA](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). A branch pública `main` permanece intocada; não copiar código privado, não publicar dados fiscais e não habilitar `host.docker.internal:2375`.

## Status

| Dimensão | Estado |
|---|---|
| R5N Vector oficial + mock mTLS | PASS (somente sintético) |
| R6A host Windows | PASS (somente inventário) |
| R6B/C/D sintético offline Windows | PASS 37/37 |
| R6F núcleo candidato + Unix GET-only + YAML manual | PREPARADO EM DRAFT |
| R6F testes locais dos arquivos novos e combinados | PASS 16/16 + 5/5; 58/58 local |
| R6F Windows no commit publicado | PENDING |
| GitHub Actions executado | **NÃO** |
| Docker Engine real / Vector original | **NÃO ACESSADO — BLOCKED** |
| Merge HML / deploy / fiscal / produção | **NO-GO** |
