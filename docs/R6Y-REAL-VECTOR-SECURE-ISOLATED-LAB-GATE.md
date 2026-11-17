# EXATA R24-03W R6Y — Gate de laboratório REAL e isolado para Vector 0.53.0

**Data:** 16/11/2026. **Governança:** [EXATA P0 Vector #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Catálogo complementar:** [#295](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/295), sem reutilização de código fiscal/ERP nesta etapa. **Laboratório público isolado:** `hlxdnapp1/f5-vector-docker-synthetic-lab`. **Base imediata:** branch `review/r6x-vector-oci-identity-readonly-20261116` commit `c8c900f41f0b19a8cc664acd08e10453109d220a` ([PR Draft #23](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/23)); a `main` do LAB é baseline protegido `72775463905e9f81730f8f8bb5e5c054f136e6ff`.

## 1. Evidências homologadas e alcance estrito

- **R6R:** proprietário executou no Windows, Node **271/271 PASS**, `ExitCode=0`; apenas fake e teste offline de contrato. Não demonstra Docker real.
- **R6S–R6U:** duas instâncias `supabase_vector_rc4-local-hml` e `supabase_vector_homologacao-v349198` em `exited`; ambas configuradas com `DOCKER_HOST=http://host.docker.internal:2375`, sem Unix mount ou TLS. R6S: **8/8** protegidos `db/analytics/studio/storage` saudáveis. R6T: 2513/2514 reinicializações históricas. R6U: ambas com `com.supabase.cli.project=True`, projetos distintos; Supabase CLI no PATH **2.117.0**.
- **R6V:** commit oficial `supabase/cli` v2.117.0 **`21db855916f2c2b12f61cde923a27094b8528b23`**, tag anotada `cdcb8e4a8bc8d10658f194186d39739f43c04d1b`. [`vector.service.ts`](https://github.com/supabase/cli/blob/21db855916f2c2b12f61cde923a27094b8528b23/apps/cli/src/commands/start/services/vector.service.ts) define `npipe` → HTTP 2375; [`vector.yaml.ts`](https://github.com/supabase/cli/blob/21db855916f2c2b12f61cde923a27094b8528b23/apps/cli/src/commands/start/templates/vector.yaml.ts) gera o `docker_logs` sem HTTPS/TLS; o container é criado por inicializador de configuração em memória. Não editar YAML imaginário nem executar `supabase start/stop`.
- **R6W:** proprietário comprovou com Docker **read-only** que ambos usam o mesmo image config ID `sha256:ca92d617e905953c3f852e7e88061f7039460e733522e3f0c21bc6ae946b2558`; **8/8 protegidos saudáveis** na observação R6W.
- **R6X:** proprietário concluiu GitHub/hash/diff/sintaxe PASS e Docker metadados OCI PASS: `linux/amd64`, tag pública **`0.53.0-alpine`**, correspondência com o digest publicado, mesmos dois Vector `exited`. Relatório local `C:\Users\Administrator\Downloads\EXATA_R6X_OCI_20261116_222256_09a8ffdb\R24_03W_R6X_RESULT.json`, SHA-256 declarado **`A3F01CD1064E6A2270A2AEAEA2D7202A0F3216E2CD02FFA3D10C102B60B6024A`** (bytes não disponíveis ao assistente para recalcular independentemente). **Tag/índice OCI ≠ prova de execução do binário e não autentica Docker API.**
- **Estado operacional:** nenhum script executou Docker pull/start/stop/exec/logs, GitHub Actions, SQL, alterações fiscais ou HML/produção. C = manter contenção. R6X **PASS de metadados**; recuperação Vector **BLOCKED/NO-GO**.

## 2. Compatibilidade técnica confirmada por referência, não em execução

- [Vector `v0.53.0` `src/docker.rs`](https://github.com/vectordotdev/vector/blob/v0.53.0/src/docker.rs): ao receber `DOCKER_HOST` com `https://`, o cliente usa `connect_with_ssl` com `key_file`, `crt_file`, `ca_file`. Sem conexão real comprovada.
- [Vector `v0.53.0` `src/sources/docker_logs/mod.rs`](https://github.com/vectordotdev/vector/blob/v0.53.0/src/sources/docker_logs/mod.rs): a fonte aceita `docker_host` e `tls`, mas o template do CLI 2.117.0 não define esses campos. Configuração em memória precisa ser corrigida **na fonte apropriada**, nunca assumida em YAML do projeto.
- [Documentação Vector — `docker_logs`](https://vector.dev/docs/reference/configuration/sources/docker_logs/): `docker_host` HTTPS é suportado com CA/certificado/chave. A fonte é de entrega **best effort**, sem `exactly once` ou replay durável implícitos; não declarar sem perdas.
- [Docker — proteger daemon](https://docs.docker.com/engine/security/protect-access/): **mTLS no próprio Docker daemon não concede acesso somente leitura** — qualquer certificado de cliente que tenha acesso pleno ao daemon pode controlá-lo. Um gateway seguro não pode ser apenas um túnel TCP que entrega essa capacidade integral ao Vector.
- [Docker — acesso remoto](https://docs.docker.com/engine/daemon/remote-access/): Docker Desktop Windows não aceita simplesmente configurar `hosts` em `daemon.json`; não tentar essa alteração nos oito serviços protegidos. HTTP 2375 sem TLS segue proibido.

## 3. Arquitetura candidata: broker de API Docker mínimo, não proxy transparente

`Vector 0.53.0` (cliente *somente* do broker; sem mounts do socket nem certificados root) → **HTTPS/mTLS no broker** → **autorizador HTTP sem privilégios de mutação para o cliente** → **backend de teste Docker Engine em VM/daemon separado**. O broker, quando finalmente implantado, precisará de acesso privilegiado ao backend em sua própria fronteira de confiança; **este risco requer controle operacional separado e revisão de segurança**, pois acesso ao Docker socket confere controle elevado.

O broker deve **negar por padrão** tudo exceto GET de endpoints comprovadamente necessários pela versão exata do Vector: `/_ping` ou `/version` quando exigidos, `/containers/json`, `/containers/{id}/json`, `/containers/{id}/logs` (`stdout/stderr`, `follow`, `timestamps`, `since`) e `/events` (filtros/timestamps limitados), com prefixo opcional de versão `/vX.Y` somente se explicitamente homologado. Não assumir essa lista suficiente até inspecionar chamadas reais do cliente. Autorização vinculada a **um projeto** (rótulos/IDs pré-autorizados), conferindo cada ID antes de acessar logs e filtrando listas/eventos contra fuga de dados entre projetos. Bloquear mudanças de método, caminhos desconhecidos, parâmetros não reconhecidos, headers perigosos, requests com body e operações POST/PUT/PATCH/DELETE.

Requisitos: cliente mTLS real com CA restrita, EKU, SAN/SNI, expiração/revogação, rota privada e firewall; **nunca** reutilizar chaves de produção em laboratório. Preservar frames Docker multiplexados e eventos NDJSON sem perda silenciosa, limites de buffer/evento, controle de backpressure, idle timeout, cancelamento limpo, fechamento imediato em falha, taxa máxima e quotas de CPU/memória. Não usar endpoint `2375` do Docker Desktop, não criar um gateway que encaminhe arbitrariamente todos os métodos ao daemon.

## 4. Pré-requisitos obrigatórios antes do PRIMEIRO teste de daemon real

1. **Aprovação explícita para mutação em ambiente descartável.** Até lá R6Y é `DESIGN_ONLY`. Nenhum `docker run/create/start/pull` ou acionamento de GitHub Actions na VM atual. Se a aprovação for dada, identificar primeiro **daemon/VM totalmente independente** da instalação Docker Desktop que contém os oito serviços, incluindo volumes, credenciais, contexto e rede; criar a VM/daemon demanda autorização e análise de recursos/risco. **Um novo container no mesmo Docker Desktop não é isolamento de daemon.**
2. **Identidade completa do artefato real:** plataforma `linux/amd64`, tag `0.53.0-alpine`, referência de distribuição e config ID; garantir correspondência de digest e executar `vector --version` **somente dentro da VM descartável**. Comparar a versão exibida com `0.53.0` e o SHA-256 do binário, se obtido de fonte oficial validada. **Não extrair segredos do container legado**.
3. **Fixtures sem dados reais:** pelo menos dois projetos falsos e um container estranho, logs stdout/stderr fictícios, eventos Docker com `follow=true`, sem dados fiscais/cadastrais, sem chaves Supabase reais, sem bind mount da stack HML.
4. **Homologação segurança/funcionalidade:** sem credencial ou com certificado inválido deve negar; certificados válidos, mas projeto distinto, devem negar; somente rotas GET aprovadas; bloquear POST e escalonamento de privilégio; rejeitar leaks de containers estranhos; comprovar conexão TLS real do Vector, streams longos/fragmentados, backpressure, cancelamento, stall e timeouts, reentrada e replay de eventos sem alegar dedupe inexistente; medir ausência de impactos na VM de destino e provar cleanup de recursos autorizados.
5. **Ledger/rollback/proveniência:** registrar *exatamente* ID/labels dos recursos sintéticos criados, imagens/digests, certificados de teste, portas e passos de remoção; encerrar somente recursos que o teste criou, deixar ambientes existentes intactos; relatório assinado por SHA-256. Se houver qualquer falha, parar, isolar e não fazer promoção.
6. **Gate independente para qualquer HML:** backup verificável dos oito serviços, prova de recuperação, saúde 8/8 antes/depois, mecanismo de alterar **somente** Vector sem recriar DB/Analytics/Studio/Storage, autorização separada, rollback real e critérios de observabilidade. O snapshot R24-03N histórico ausente não pode ser presumido recuperado.

## 5. Decisões e indicadores

| Escopo | Estado atual |
| --- | --- |
| R6R — Node offline R6B–R6R 271/271 | `PASS_OFFLINE_ONLY` |
| R6S–R6U e R6W/R6X — Windows read-only | `PASS_READ_ONLY` pelo relatório do proprietário |
| Supabase CLI código v2.117.0 e Vector 0.53.0 fonte | `PINNED_SOURCE_REVIEWED` |
| Compatibilidade de imagem pelo OCI local | `TAG_AND_DIGEST_MATCH_NOT_BINARY_PROOF` |
| Primeiro binário Vector real e fluxo Docker `follow=true` via mTLS | `NOT_RUN / BLOCKED` |
| Broker com isolamento por projeto, backpressure e autorização | `NOT_IMPLEMENTED` |
| Daemon/VM separado e autorização de teste | `NOT_APPROVED / NOT_PROVISIONED` |
| HML/produção, SQL, Docker atual, merge e deploy | `NO_GO / NOT_RUN` |

**Próximo passo:** somente quando o proprietário **aprovar de forma explícita** o uso de um daemon/VM descartável para um teste real, planejar e fornecer script pinado para preparação da VM independente, verificando backup e preservando o Docker Desktop atual. Sem aprovação ou capacidade de isolamento, manter C/contenção; nenhuma nova bateria de mocks muda este resultado.

**R6Y neste PR Draft contém apenas este documento.** Não modifica scripts de teste, aplicações, workflows ou main; nenhum PowerShell é necessário agora.
