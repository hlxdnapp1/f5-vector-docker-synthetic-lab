# EXATA R24-03W R6V — Diagnóstico de origem Supabase CLI v2.117.0 e decisão de recuperação protegida

**Data:** 16/11/2026. **Governança:** [EXATA Issue #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Repositório de pesquisa público isolado:** `hlxdnapp1/f5-vector-docker-synthetic-lab`. **Base R6U:** branch `review/r6u-vector-cli-origin-readonly-20261116`, commit `0f6fe07634e41fc66fea3b7be8b3510f3bd4f324` ([PR Draft #20](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/20)).

## 1. Evidências de campo R6R–R6U recebidas do proprietário

| Marco | Evidência | Limite |
| --- | --- | --- |
| R6R | Windows: 16/16 focados, 271/271 totais; ExitCode 0; GitHub/hashes/sintaxe PASS | **Apenas** simulações offline; Vector/Docker reais não executados |
| R6S | Dois Vector `exited`, `DOCKER_HOST` de ambos `HTTP_2375_UNSAFE`, nenhum Unix mount, nenhum listener 2375/2376 observado **no Windows**; 2+2+2+2 instâncias db/analytics/studio/storage `healthy` | Não prova conectividade do namespace Linux nem saúde **agora** |
| R6T | Ambos `com.docker.compose.project` presentes, `config_files` ausente, nenhum indicador TLS, nenhum mount; 2513/2514 restarts acumulados, redes customizadas | Não identifica sozinho a ferramenta criadora |
| R6U | Ambos `com.supabase.cli.project=True`, `com.docker.compose.project=True`, `COMPOSE_PROJECT_SAME=False`, ausência de `compose config-hash/version/workdir/config-files`, `supabase.service/stack-root/instance=False`; CLI no PATH `2.117.0` | Identidade histórica do binário criador ainda não atestada |

SHA-256 de relatório R6U informado pelo proprietário: `A3490DC76815C1B77979619DEC434C3AF4BBAC932D97D0B52C8DE3FF85704737`, caminho local `C:\Users\Administrator\Downloads\EXATA_R6U_ORIGIN_20261116_220905_24440ea2\R24_03W_R6U_ORIGIN_RESULT.json`. Os bytes do arquivo não estão acessíveis aqui para recálculo independente. R6U PowerShell informou GitHub/branch/commit/hashes/diff/sintaxe PASS, consulta read-only PASS, sem mutações.

**Sem intervenção operacional:** Docker, banco, SQL, WSL, Agente Fiscal, GitHub Actions, EXATA HML/produção intocados pelo script R6U.

## 2. Auditoria do CÓDIGO DA VERSÃO INSTALADA, e não somente da branch mais recente

Repositório oficial: `supabase/cli`, tag **`v2.117.0`**, tag anotada `cdcb8e4a8bc8d10658f194186d39739f43c04d1b`, commit imutável **`21db855916f2c2b12f61cde923a27094b8528b23`** (tag criada em 07/09/2026).

1. [`apps/cli/src/commands/start/services/vector.service.ts`](https://github.com/supabase/cli/blob/21db855916f2c2b12f61cde923a27094b8528b23/apps/cli/src/commands/start/services/vector.service.ts), blob `0ff2aa7165bfaef40fac98f4a3246421f7061548`, linhas 179–189: a função `legacyResolveVectorDockerSocketPlan` faz, **para esquema Docker `npipe` Windows**, `env.DOCKER_HOST = http://host.docker.internal:2375`. A opção Unix injeta bind mount; para `npipe`, não há mount. Isto reproduz precisamente o padrão R6S, sem assumir que outro endpoint HTTP sem TLS esteja seguro.
2. [`apps/cli/src/command-internal/db-bootstrap/container-lifecycle.ts`](https://github.com/supabase/cli/blob/21db855916f2c2b12f61cde923a27094b8528b23/apps/cli/src/command-internal/db-bootstrap/container-lifecycle.ts), blob `15e78f9896f316f95e869b13b0d0f1dd848db860`, linhas 829–835: o CLI inclui `com.supabase.cli.project` e `com.docker.compose.project` nos containers criados por sua própria API. **Etiquetas Compose não provam invocação de `docker compose`.**
3. [`apps/cli/src/commands/start/SIDE_EFFECTS.md`](https://github.com/supabase/cli/blob/21db855916f2c2b12f61cde923a27094b8528b23/apps/cli/src/commands/start/SIDE_EFFECTS.md), blob `47fb80834453953e57c9a06318e2c102789c27e4`, linhas 105–109: o CLI **renderiza `vector.yaml` em memória e injeta o conteúdo no container** em vez de depender de um `vector.yaml` persistente em disco no host. Alterar um YAML imaginado no projeto não recuperaria o Vector existente.

**Conclusão causal limitada:** foi identificado um **caminho de código compatível com os sinais observados** que explica a atribuição de `DOCKER_HOST` para o Vector quando o host usa Docker Desktop Windows `npipe`. A hipótese de falha de listagem por 2375 inacessível é forte, mas a causa efetiva dos 2513/2514 reinícios e a conectividade exata dentro dos containers ainda **NÃO foram comprovadas**. A versão CLI instalada agora não atesta por si só a versão usada na criação histórica dos containers. A presença de duas etiquetas de projeto distintas é coerente com projetos locais separados, não com um único projeto necessariamente duplicado.

## 3. Decisão de segurança: NÃO reativar nem mudar configurações para 2375

- **C — Manter contenção: GO para preservação do estado atual.** Não rodar `supabase start/stop`, `docker start/restart/stop/exec`, `compose up/down`, `docker system prune`, nem atualizações CLI. Manter observabilidade Vector em modo degradado, registrando impacto; os demais serviços devem continuar protegidos.
- **A — Socket Unix direto: NO-GO.** Host Windows `npipe` não prova disponibilidade de `unix:///var/run/docker.sock` no namespace do Vector. Montar diretamente o Docker socket, **mesmo com `:ro`**, não elimina os poderes do Docker API; não autorizar acesso privilegiado sem intermediação e isolamento.
- **B — Gateway TLS/mTLS: NÃO HOMOLOGADO.** Exige caminho de rede do container para endpoint certificado, SAN/SNI correto, CA/cliente mTLS, transporte real GET com streaming `follow=true`, eventos NDJSON e logs Docker mux, backpressure/aborto, identidade revalidada e quotas. R6G–R6R são provas offline, não gateway produtivo.
- **D — Atualizar CLI v3: NO-GO.** Há mudanças de arquitetura e compatibilidade; nenhuma atualização é necessária para comprovar o incidente e não é rollback seguro do stack local.
- **E — Desabilitar/retirar o Vector: NO-GO sem plano.** Poderia alterar rastreabilidade/analytics e o restante da stack. Não confundir manter `exited` com remover.

## 4. Gate técnico antes de qualquer reparo futuro

1. **Manifesto de estado pré-mudança:** identificar versão efetiva da stack por projeto, binário que iniciou cada serviço, rede, política de restart, labels, imagens/digests, mounts/volumes **sem expor segredos**. Produzir inventário **local privado** e hashes; não publicar env bruto nem IDs/endereços internos.
2. **Backup/rollback:** confirmar backup independente dos oito serviços (duas instâncias por categoria), snapshots/exports relevantes, identificadores de containers antigos e procedimento de reversão testável. O snapshot histórico R24-03N está ausente e não pode ser tratado como recuperado.
3. **Protótipo segregado realmente descartável:** antes de alcançar a VM usada pelos oito serviços, provar A ou B em daemon/controlador separado, com dados fictícios, networking/TLS, Vector **binário real exatamente pinado**, cleanup exato e bloqueio fail-closed. Autorização independente para qualquer daemon novo, mesmo descartável.
4. **Alteração mínima em HML:** somente após gates 1–3 e aprovação explícita, planejar mudança **restrita aos dois Vector**, sem recriar os oito serviços protegidos. **Verificar**, não presumir, se o CLI de fato permite atualização individual preservando o restante da stack; não editar configuração apenas de laboratório e alegar correção HML.
5. **Observação posterior:** exigir saúde 8/8 antes/depois, conexão autenticada do Vector, ausência de reinícios involuntários, isolamento entre projetos, métricas de logs sem vazamento, rollback e política de recuperação. Nenhuma promoção à produção sem novo gate fiscal/operacional.

## 5. Próximo trabalho com retorno decisivo

**R6W candidato: revisão arquitetural de um adaptador local isolado de GET para leitura de logs (sem acesso privilegiado direto pelo Vector)**, compatível com o CLI v2.117.0 sem mudar o engine ou criar endpoint 2375 desprotegido. O R6W deve primeiro verificar se a camada `vector.yaml` consegue configurar um Docker endpoint seguro de forma independente da variável `DOCKER_HOST`; se a versão exata do Vector/Bollard não suportar o plano sem gateway real confiável, **BLOCKED**, não improvisar. Alternativa de observabilidade administrativa temporária via comandos `docker logs` **somente leitura** e mascaramento pode ser avaliada separadamente, sem substituir coleta contínua nem derrubar serviços.

**R6V neste PR Draft é documento de decisão somente, sem script Windows novo, sem testes Node novos, sem Docker real, sem GitHub Actions, merge, HML ou produção.** R6R: PASS 271/271 offline; R6S/R6T/R6U: PASS de leitura com evidências do proprietário; recuperação Vector: BLOCKED/NO-GO. Preservar tudo que já funciona.
