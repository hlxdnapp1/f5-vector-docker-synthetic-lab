# EXATA R24-03W R6S — Diagnóstico de topologia Windows, somente leitura

**Governança:** [EXATA issue #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315), 16/11/2026. **Base autorizada:** R6R, PR Draft #17, branch `review/r6r-offline-r6o-r6q-bridge-20261116`, commit `fe4c50436c04b8050d96713022bf67fa927adaaa`.

## Evidência R6R recebida

No Windows do proprietário, o R6R concluiu **PASS 16/16 focado**, **PASS 271/271 combinado**, **ExitCode 0**, verificações GitHub/commit/hashes/diff/LF e sintaxe PASS. Relatório `C:\Users\Administrator\Downloads\EXATA_R6R_OFFLINE_20261116_214348_4b7be724\R24_03W_R6R_RESULT.json`, SHA-256 informado `014705E2CB4042AAB420C43B212DD0A76BE76CB42D1B35645ABADCEEE55E672A`. O arquivo não foi entregue para recálculo independente. Os 271 testes não serão repetidos sem mudança no código homologado.

## Decisão de engenharia

**Interromper a acumulação de simulações.** A próxima dúvida a resolver é o estado atual e a origem da configuração de Docker API nos dois Vector contidos, não mais o protocolo mock. A [documentação do Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) ainda descreve exposição TCP 2375 no Windows para logs locais; isso **não autoriza** habilitar Docker Engine sem TLS no EXATA. A [documentação do Docker Desktop](https://docs.docker.com/desktop/troubleshoot-and-support/faqs/general/) descreve pipes Windows e Unix socket nas condições suportadas. A [documentação WSL 2](https://docs.docker.com/desktop/features/wsl/) mostra diferenças importantes de integração, inclusive modos sem socket Linux disponível: **não presumir** socket montável nem equivalência de namespaces.

## Novo arquivo R6S

`scripts/R6S-READONLY-WINDOWS-TOPOLOGY.ps1` — inventário de observabilidade **somente leitura** para Windows PowerShell 5.1, iniciado exclusivamente depois de clone GitHub em pasta isolada, validação do commit fixado, Git blob, SHA-256 e sintaxe `System.Management.Automation.Language.Parser`.

Antes de acessar o daemon, confirma que `DOCKER_HOST` (se definido) e o contexto efetivo são `npipe` local explicitamente permitido; recusa contextos remotos, TCP, SSH, Unix não comprovado e engine não Linux. Usa somente `docker context show`, `docker context inspect`, `docker version`, `docker info`, `docker ps -a` e `docker container inspect` **dos dois nomes Vector conhecidos**. Consulta, quando disponível, `Get-NetTCPConnection` para identificar listeners Windows 2375/2376 **sem abrir conexões**.

Inspeciona o estado dos dois Vector, classe `DOCKER_HOST`, existência de mount Docker Unix, presença de variáveis TLS (somente booleanos), etiquetas Compose (somente booleanos), modo de rede generalizado e quantidade de mounts. Não imprime nem grava valores de variáveis, certificados, tokens, IDs/endereços privados, caminhos de mounts, labels sensíveis, nomes de outros containers ou logs de aplicação. Conta apenas grupos de serviços `supabase_db_*`, `supabase_analytics_*`, `supabase_studio_*`, `supabase_storage_*`. Os nomes desses quatro grupos **não garantem cobrir os oito serviços protegidos**; não afirmar saúde total a partir de contagem parcial.

Produz relatório JSON sanitizado e SHA-256 em pasta inédita de Downloads. Recusa erros críticos de contexto, integridade, permissões Docker, JSON e identidade. Não inicia ou para containers, não chama `docker exec`, não chama `docker logs`, não habilita TCP, não lê segredos de arquivos, não acessa WSL, não executa SQL, não altera HML nem produção. Mesmo que se detecte um mount, listener ou HTTPS, **não comprova conectividade do Vector em seu namespace** nem mTLS; ambos continuam `NOT_PROVEN`.

## Gates de execução

1. **G0 GitHub:** verificar PR Draft e escopo exato de dois novos arquivos (este documento e um script), `main` preservada, script hash e commit pinados.
2. **G1 Windows:** verificar `git`, `docker`, SHA-256 e sintaxe sem executar a etapa operacional. Falha interrompe.
3. **G2 Leitura local:** somente consultas listadas, sanitização antes de gravar, relatório com classificação A/B não comprovadas e recomendação C até avaliação.
4. **G3 Decisão:** se o contexto não for pipe local, se surgir container Vector inesperadamente rodando, ou se houver listener exposto, **não modificar nada**; relatar bloqueio/risco e exigir análise da evidência.
5. **G4 Eventual recuperação:** dependerá de autorização independente de plano de backup/rollback, identificação de Compose/gerador Supabase CLI, demonstração de topologia viável, compatibilidade real Vector 0.53 e proteção dos oito serviços. Nenhum deploy/produção autorizado.

**Status:** R6R PASS OFFLINE, R6S SCRIPT PREPARADO / SINTAXE E LEITURA WINDOWS PENDENTES. Docker/Vector real não executado na criação deste arquivo. GitHub Actions NOT_RUN. HML/produção NO-GO. A observabilidade original continua em contenção.
