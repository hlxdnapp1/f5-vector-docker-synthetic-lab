# EXATA R24-03W R6X — Conciliação OCI da imagem Vector sem executar containers

**Data:** 16/11/2026. **Governança:** [EXATA #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). Repositório LAB público `hlxdnapp1/f5-vector-docker-synthetic-lab`. Branch-base R6W `review/r6w-vector-image-identity-readonly-20261116`; commit `a477f6adaa7f27c99e1410aafc7e21bb61060d18`; [PR Draft #22](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/22).

## 1. Evidência Windows R6W (não repetir)

O proprietário executou R6W com **GitHub/branch/commit/hashes/diff/sintaxe PASS** e **consulta read-only PASS**. Ambos Vector `exited`, ambos com o mesmo **Docker local image config ID** `sha256:ca92d617e905953c3f852e7e88061f7039460e733522e3f0c21bc6ae946b2558`; **8/8** serviços `db,analytics,studio,storage` `running/healthy`. Relatório informado `C:\Users\Administrator\Downloads\EXATA_R6W_IMAGE_20261116_221832_c1a51ba0\R24_03W_R6W_RESULT.json`, SHA-256 `3B6ECD3BDB08F3F1F798D7D5148DE4A9EB8CF8421BE63A3AF5F3DAFBA13838D9` — o arquivo não foi transmitido para recálculo independente.

A classificação R6W `UNKNOWN_OR_PRIVATE` **NÃO demonstra** que a imagem seja privada nem que a versão seja diferente: o classificador reconhecia apenas `timberio/vector` e `ghcr.io/supabase/cli/vector`, não `ghcr.io/supabase/vector` ou `public.ecr.aws/supabase/vector`.

## 2. Fonte externa relevante e ressalva criptográfica

O registro público [GitHub Packages — Supabase Vector](https://github.com/supabase/cli/pkgs/container/vector) lista **`0.53.0-alpine`** com digest publicado **`sha256:ca92d617e905953c3f852e7e88061f7039460e733522e3f0c21bc6ae946b2558`**. O documento histórico [Supabase `docker/versions.md`](https://github.com/supabase/supabase/blob/master/docker/versions.md) registra a troca da imagem Docker oficial para Vector `0.53.0-alpine` em fevereiro de 2026.

**Cuidado:** o `.Image` de um container e `docker image inspect .Id` são IDs de configuração da imagem, enquanto `.RepoDigests` pode conter digests de manifesto/índice OCI. Não substituir uma evidência pela outra: mesmo quando as sequências de hash coincidem, isto não comprova sozinho arquitetura, tag imutável ou versão do executável. A tag pode ser movida e o executável não foi iniciado. A correspondência identificada requer reconciliação local de `.RepoTags`, `.RepoDigests` e `.Architecture`.

## 3. Novo R6X — estritamente metadados locais

`scripts/R6X-READONLY-VECTOR-OCI-IDENTITY.ps1`:

1. Valida **SHA-256 e formato** do relatório R6W, identidade exata do image ID esperado e estado anterior dos dois Vector.
2. Exige contexto e `DOCKER_HOST` Windows `npipe` local, Docker Engine Linux e o estado **`exited`** de ambos os Vector. Revalida que ambos apontam para o mesmo ID de imagem previamente encontrado.
3. Executa apenas `docker image inspect --format` de `.Id`, `.Os`, `.Architecture`, `.RepoTags`, `.RepoDigests` **do ID local fixo**. Não faz `docker pull`, `run`, `start`, `stop`, `exec`, `logs`, `save`, `load`, `tag` ou leitura de configuração/ambiente/credenciais.
4. Nunca imprime strings de repositório não reconhecido; só aceita correspondência de versionamento em repositórios públicos conhecidos `docker.io/timberio/vector`, `ghcr.io/supabase/vector`, `ghcr.io/supabase/cli/vector`, `public.ecr.aws/supabase/vector` e `supabase/vector`. Caso contrário, devolve `UNVERIFIED`, sem revelar valores.
5. Verifica compatibilidade de tag `0.53.0-alpine` e separadamente presença do digest de índice OCI conhecido nas referências locais. A cobertura retorna `TAG_AND_PUBLIC_INDEX_DIGEST_MATCH_NOT_BINARY_PROOF`, `TAG_MATCH_DIGEST_NOT_PROVEN`, ou `VERSION_UNVERIFIED_OR_DIFFERENT`.
6. Grava somente um novo relatório JSON sanitizado com SHA-256 em pasta inédita de Downloads.

Este passo **não reconsulta a saúde 8/8**: reporta somente a última leitura de R6W, evitando varreduras repetidas. Não faz conexão com registry/remoto nem execução de binário Vector. A ausência de tag ou digest é dado válido; **não** inventar versão com base exclusivamente no hash do container.

## 4. Gates e próximo avanço

| Gate | Situação |
|---|---|
| R6R 271/271 Node, R6S/T/U e R6W leitura | PASS conforme Windows do proprietário |
| R6W versão de imagem a partir da classificação | `UNVERIFIED` por regex restrita |
| R6X integridade GitHub/escopo | Verificar após PR Draft |
| R6X PowerShell sintaxe e reconciliação OCI local | **PENDENTE WINDOWS** |
| Vector v0.53.0 binário realmente executado / mTLS / streaming | **NOT_RUN/BLOCKED** |
| A socket Unix, B gateway TLS/mTLS para recuperação | **NO-GO até homologação independente** |
| C manter dois Vector contidos e oito serviços preservados | **PRESERVAR** |
| GitHub Actions, Docker mutações, SQL, produção | **NÃO EXECUTAR** |

Se houver tag pública `0.53.0-alpine` confirmada e registro digest local correspondente, usar a **mesma imagem/digest** em um futuro laboratório Docker totalmente separado, **somente depois de aprovação explícita** do ambiente descartável, backup, rollback e isolamento. Até lá, nenhum Docker Engine exposto na porta 2375, atualização CLI ou reinício dos Vector existentes.
