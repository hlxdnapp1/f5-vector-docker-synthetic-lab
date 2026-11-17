# EXATA R24-03W R6T — Decisão de contenção e identificação da origem da configuração Vector

Data: 16/11/2026. Governança EXATA: [Issue #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). Branch-base R6S `review/r6s-windows-vector-topology-readonly-20261116`, commit `31404952f20764acf08d902814a23295c9e3bd0a` (PR Draft #18). **Revisão documental somente.**

## Evidência R6S enviada pelo proprietário

Relatório local `R24_03W_R6S_TOPOLOGY_RESULT.json` — SHA-256 informado `91913CF2DF18099390BD4334CB657ABFAB9EFDD4D35F40DB258E6BF4DDB16DCF`. Os bytes não foram disponibilizados para recálculo independente nesta conversa. PowerShell confirmou GitHub/branch/commit/hashes/diff/sintaxe PASS e leitura Docker sem mutação PASS.

| Campo diagnosticado | Resultado relatado |
| --- | --- |
| Vector `supabase_vector_rc4-local-hml` | `exited` |
| Vector `supabase_vector_homologacao-v349198` | `exited` |
| `DOCKER_HOST` dos dois | `HTTP_2375_UNSAFE` (host.docker.internal:2375, sem TLS) |
| Mount `/var/run/docker.sock` nos dois | Não presente |
| Listeners Windows 2375/2376 via Get-NetTCPConnection | Zero detectados; consulta `READ_OK` |
| PostgreSQL, Analytics, Studio e Storage | 2/2 running e healthy em cada uma das quatro categorias (**8/8 nas categorias diagnosticadas**) |
| Docker real/Vector reiniciados, SQL, alterações HML | Nenhuma operação de mutação foi executada pelo script |

Este resultado é uma **forte hipótese operacional de indisponibilidade do endpoint 2375** para a coleta, mas **não demonstra** conexão a partir do namespace de rede Linux do Vector nem explica definitivamente os milhares de reinícios históricos. Nenhum teste foi executado dentro dos containers. A ausência de listener **no Windows** não é prova universal de indisponibilidade dentro da VM.

## Referências e incompatibilidade operacional

- [Supabase CLI — execução local](https://supabase.com/docs/guides/local-development/cli/getting-started): a documentação oficial ainda orienta expor `tcp://localhost:2375` no Windows para logs locais. Isto **não** autoriza habilitar API Docker sem TLS no EXATA, com outros serviços em execução.
- [Supabase self-hosted — docker-compose.logs.yml](https://github.com/supabase/supabase/blob/master/docker/docker-compose.logs.yml): a distribuição self-hosted possui Compose e mount de socket Docker para Vector. Isto **não prova** que os dois containers existentes foram criados por esse Compose nem que o mount seja viável no Docker Desktop Windows/WSL.
- [Docker Desktop com WSL 2](https://docs.docker.com/desktop/features/wsl/): o acesso a socket é condicionado por backend/integração; não presumir equivalência entre namespaces Windows, WSL e containers Linux.
- [Supabase changelog 04/11/2026](https://supabase.com/changelog/supabase-cli-v3): CLI v3 alterou semântica e comandos. **Não executar `supabase start`, `stop`, atualizações ou comandos presumidos sem identificar versão, opções e impactos.**

## Decisão R6T: manter alternativa C enquanto A e B não forem comprovadas

**C (manter contenção): opção segura recomendada agora** — os dois Vector continuam parados e as oito instâncias observadas dos quatro grupos de serviços permanecem saudáveis. Não alterar Docker Desktop, WSL, rede, host 2375, volumes, imagens, certificados, containers ou bancos.

**A (Unix socket): BLOCKED**, porque o mount não existe no Vector atual e não foi demonstrado caminho seguro, isolamento real do Docker socket ou compatibilidade com a topologia Windows/WSL. Um mount read-only de socket Docker **não** elimina o privilégio de controlar a API, portanto exigir controlador de acesso, lista restrita de operações e prova independente.

**B (HTTPS/mTLS): BLOCKED**, porque não há endpoint 2376 detectado no Windows nem evidência de servidor mTLS, CA, cliente e SAN válidos ou rota entre namespace do Vector e gateway. O laboratório público R6G/R6R não comprova funcionamento com o binário real Vector.

## Próximo gate útil: aproveitar o relatório já gerado, sem nova consulta Docker

O JSON R6S contém, para cada Vector, campos sanitizados `compose_label`, `compose_config_files_label`, `tls_verify_present`, `tls_cert_path_present`, `network`, `mount_count` e `restart_count`, que **não foram incluídos na saída resumida enviada**.

1. Validar SHA-256 do JSON existente, antes de confiar nos campos.
2. Imprimir somente os booleanos/contagens/categorias já sanitizados, para identificar se há indícios de autoria via Docker Compose e se existem sinais de TLS; sem exibir paths, nomes de outros containers, env, IDs ou segredos.
3. Se ambos `compose_label` e `compose_config_files_label` forem falsos, não inferir automaticamente autoria Supabase CLI: inspecionar separadamente a versão do CLI e a proveniência de configuração; não presumir.
4. Se forem verdadeiros, isto é indício de Compose, mas **não diz sozinho** se é CLI gerando Compose, override self-hosted ou projeto manual. Identificar arquivo/fonte e versão em fase **somente leitura**, sem abrir paths de usuários ou segredos em relatórios públicos.
5. Para qualquer solução de A/B, submeter primeiro design com backup, rollback e verificação de saúde de todos os oito serviços, aprovação específica antes de tocar containers/daemon; nenhuma aprovação aqui.

## Estado

R6R `271/271 PASS OFFLINE`; R6S `PASS_READ_ONLY_WINDOWS` conforme saída enviada; R6T `DECISION_DOC_ONLY`. C `MANTER CONTENCAO`; A/B `NOT_PROVEN`; GitHub Actions NOT_RUN; Docker mutations NOT_RUN; HML/produção `NO_GO`. Próximo comando proposto é **somente leitura do arquivo JSON R6S previamente produzido**, não nova rodada de mocks nem acesso de rede/daemon.
