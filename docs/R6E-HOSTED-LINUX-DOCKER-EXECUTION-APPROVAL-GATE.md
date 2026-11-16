# R6E — Gate de aprovação para laboratório Docker Linux REAL e descartável (DOCUMENTO, SEM EXECUÇÃO)

Data: 2026-11-16. Projeto: `hlxdnapp1/f5-vector-docker-synthetic-lab` (público).
Governança EXATA: [issue #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315).
Baseline imutável de aprovação offline: R6D commit `2355570ad5480a565d117f3825349be7329690b8`, público [PR Draft #3](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/3). Evidência Windows do proprietário: GitHub/commit/blob/diff/sintaxe PASS; **37/37 testes Node PASS**, relatório `R24_03W_R6D_RESULT.json` SHA-256 `157D001F1C4E7A2F71F95012B9CB333BA198946B26709E781D799A22C5DC398B`. **Nenhuma operação Docker nem workflow Actions foi executado.**

## Status desta proposta

**R6E-DESIGN-ONLY**. Este PR deverá conter somente o presente Markdown de planejamento. **Não** cria, altera ou habilita arquivo `.github/workflows/*`; não prepara executável de comunicação com Docker, não executa Actions, não faz merge, não abre sockets, não altera HML/Windows/SQL/fiscal/produção. Qualquer aprovação anterior autorizou a criação do repositório público e testes offline, **não** a primeira execução de Docker real.

## Por que precisamos deste gate

- R5N demonstrou o Vector 0.53.0 oficial com um **Docker API mock em memória, HTTPS/mTLS loopback**, mas não com daemon real.
- R6B/C/D aprovou modelos offline, usando **IDs fictícios** e somente marcadores sintéticos. R6C é um classificador; R6D é um projetor de respostas **em memória**, não são um servidor/proxy/endereço de daemon.
- Para provar um Docker real, será necessário um **adaptador de transporte distinto, ainda não implementado**, com saída realmente limitada e filtrada. Nunca apontar o mock/projetor existente diretamente para `/var/run/docker.sock` ou TCP.
- A causa dos reinícios dos dois Vector locais permanece `NOT_PROVEN`; oito contêineres de HML permanecem protegidos.

## Alternativa proposta: GitHub-hosted Ubuntu padrão, público e temporário

1. Runner: `ubuntu-24.04` **padrão hospedado pelo GitHub**, uma VM efêmera independente do Windows do usuário; **nunca** `self-hosted`, `ubuntu-slim`, host pessoal, infraestrutura Supabase ou Docker Desktop.
2. Custo: documentação GitHub informa que o uso de runners padrão em **repositórios públicos** é gratuito e ilimitado. Antes de cada ativação confirmar que o repositório ainda é `public` e que o rótulo de runner é **padrão**; não usar runners `larger` nem armazenamento externo faturado. A condição de gratuidade depende dessas condições, não do plano Pro.
3. Segurança de evento: futuro workflow exigirá `workflow_dispatch` **exclusivo**, sem `push`, `pull_request`, `schedule`, `workflow_run` ou `pull_request_target`; `permissions: contents: read`, `timeout-minutes` curto, `concurrency` contra paralelismo, sem secrets, OIDC, token de terceiros, `secrets: inherit`, artefatos com conteúdo privado, ou checkout do repositório EXATA.
4. Gate de aprovação: GitHub informa que `workflow_dispatch` só executa se o arquivo de workflow estiver presente na **branch padrão**. Por isso o YAML não pode ser simplesmente adicionado a uma Draft branch e declarado executável. Exige revisão do arquivo exato e **aprovação específica e separada** para introduzi-lo em `main`; depois requer **outra confirmação explícita para executar o primeiro job**. Mesmo `manual` não elimina riscos de commits públicos com code paths alteráveis.
5. Pinned source: proteger os manifests por SHA de commit, imagens por digest verificável, código e versões fixados. Não usar `latest` como evidência de reprodutibilidade. Jobs devem rejeitar referência distinta da homologada.

## Arquitetura futura de teste e fronteira de confiança

```text
GitHub-hosted Ubuntu 24.04 ephemeral VM (público, aprovado)
  ├─ job e credenciais: somente GitHub token read-only, sem secrets
  ├─ Docker Engine LOCAL do runner (identidade/Unix socket validados)
  │   ├─ synthetic-authorized (container descartável, dados artificiais)
  │   └─ synthetic-outsider   (container descartável, não autorizável)
  ├─ adaptador R6E AINDA NÃO IMPLEMENTADO, sob revisão independente:
  │   mTLS client identity -> request allowlist -> Unix socket Docker local
  │   -> response allowlist/sanitize -> bounded streaming/backpressure
  └─ Vector oficial fixado -> endpoint de teste -> console sintético
```

**Atenção:** acesso ao socket do Docker permite operações privilegiadas no daemon. Mesmo num runner temporário, não expor esse socket a código de terceiros, containers não confiáveis, fork PRs ou serviços de rede. Limitar o processo que detém o socket e extingui-lo ao final. Evitar `--privileged`, `--network host`, mounts amplos e listeners TCP 2375. O mTLS entre Vector e gateway **não** autoriza por ID no daemon; o adaptador precisa impor as políticas em ambas as direções.

### Gate 1 — Identidade e não interferência

- Confirmar VM hospedada GitHub, identificador do job e contexto Docker local Unix socket; rejeitar `DOCKER_HOST`, `DOCKER_CONTEXT`, TLS externo, configuração de registro remoto, endpoint não Unix, ou runner diferente do esperado.
- Confirmar que não existe conectividade intencional com endereços, tokens ou redes privadas EXATA/HML. Não tentar conectar ao servidor Windows. Não revelar inventários brutos.
- Validar versão Docker compatível, espaço disponível e limites de memória/CPU antes de criar objetos.
- Rejeitar se o daemon puder ser compartilhado com recursos do proprietário; **um container novo num daemon HML existente não é isolamento**.

### Gate 2 — Apenas objetos descartáveis

- Materializar 2 containers **estritamente sintéticos** com imagem imutável por digest, nomes/labels prefixados com nonce único, limites de memória, CPU, logs e tempo. Não reutilizar volumes, networks, containers, contextos ou nomes existentes.
- Nunca montar socket no container de teste. Não usar secrets, env de cliente, dados de fiscal, SQL, armazenamento Supabase ou acesso externo.
- Registrar somente IDs sintéticos redigidos (ou hashes), estados, contadores e marcadores seguros; não enviar logs brutos para artifacts públicos.

### Gate 3 — Requisições *e* respostas

- Somente GET permitidos: ping/version/list running, inspect do único ID autorizado, events escopados, logs do único ID autorizado.
- Validar versão e query; `tail=all` de Bollard deve ser **normalizado na requisição efetiva upstream** para `tail=100` ou menos, nunca apenas classificado.
- A LIST deve filtrar identidades antes de retornar; INSPECT deve remover `Env`, labels sensíveis, mounts, host paths, IPs e segredos; EVENTS filtrados por ID; logs multiplexed com framing correto, UTF-8 e limites de byte/tempo/cancelamento.
- Exigir testes negativos para POST/PATCH/DELETE, ID outsider, filtros malformados, duplicação, corpo excessivo, eventos infinitos, timestamp antigo, conexões interrompidas e cliente TLS desconhecido.
- Provar que nenhum payload de outsider atravessa a fronteira **nem em bytes parciais**, com processamento seguro de chunks. **R6D atual não faz isso e não pode ser substituto de um filtro de streaming real.**

### Gate 4 — Relatório, teardown e rollback

- Os testes devem parar no primeiro erro e salvar resultado redigido de: commit, versão do Vector/Docker, classe de runner, PASS/FAIL por teste, hashes e status de teardown.
- Teardown limitado **exclusivamente aos IDs recém-criados e comprovados**, com verificação de ausência de objetos remanescentes; não executar `docker system prune`, `docker volume prune`, ou operações contra outros containers.
- Encerrar processos e canais do próprio job. O runner é descartado ao final; isso não elimina a necessidade de detectar falha de limpeza.
- Se não houver autorização, tempo/capacidade, imagem por digest, daemon isolado, adaptador revisado ou rollback seguro: `BLOCKED`, sem execução ou afirmação de sucesso.

## Decisão GO/NO-GO

| Dimensão | Estado |
| --- | --- |
| R5N Vector + API Docker mock HTTPS/mTLS | PASS (somente sintético) |
| R6A inventário do servidor Windows | PASS (somente leitura) |
| R6B/C/D teste de contrato sintético | PASS offline 37/37 |
| R6E arquitetura e critérios | DOCUMENTADO |
| R6E adaptador Docker real | NOT_IMPLEMENTED |
| R6E workflow manual aprovado | NOT_CREATED / NOT_AUTHORIZED |
| R6E job Docker real em GitHub Actions | NOT_RUN / BLOCKED |
| Recuperação dos dois Vector HML | NO-GO |
| Produção | NO-GO |

## Fontes externas

- GitHub Docs, [Choosing a runner for a job](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job): runner padrão público gratuito e isolado em VM.
- GitHub Docs, [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch): exige workflow na branch padrão para disparar manualmente.
- Docker Docs, [Protect the Docker daemon socket](https://docs.docker.com/engine/security/protect-access/): socket/credenciais exigem proteção equivalente ao privilégio do daemon.

**Regra central: GitHub principal privado → laboratório público sintético separado → revisão de segurança → testes offline → aprovação para workflow → aprovação para Docker real → homologação HML separada → produção protegida.**
