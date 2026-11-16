# EXATA R24-03W R6N — Vector 0.53.0 protocol-shape compatibility (DRAFT / OFFLINE)

**Data:** 2026-11-16. **Repositório principal:** `hlxdnapp1/Sistema_Automacao_Comercial`, [governança privada #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Laboratório público:** `hlxdnapp1/f5-vector-docker-synthetic-lab`.

## Autorização e base imutável

O usuário autorizou somente **preparação/revisão em nova branch e PR Draft**, não o uso de Docker Engine, imagens reais, containers, GitHub Actions, merge, SQL, operações fiscais, Windows/HML ou produção. O R6M foi preparado no commit público `86ad186e0df86fd3a667fb8abd5d00c97e57064e`, PR Draft #12, sem modificar executáveis. O R6L homologado anteriormente no Windows do proprietário: **179/179 Node offline PASS**, commit `1b632387ee4b68c29fdbd3d5630b60ed809f5b52`, SHA-256 do relatório **informado** `02325203F31482D508D32ED090908F3C736EB8140AAD72104F8CA95DA8591B72` (bytes do relatório não recebidos para recálculo).

## Referência técnica exata do Vector

Fonte oficial: repositório `vectordotdev/vector`, tag anotada `v0.53.0` (objeto tag `ed2635593b5a6641735accae8e9c94c5dade52c9`), **commit real da tag `2b51b40a7a0b40996350d73cf46791c7e991fcb6`**. Código consultado [`src/sources/docker_logs/mod.rs`](https://github.com/vectordotdev/vector/blob/v0.53.0/src/sources/docker_logs/mod.rs), blob Git `45268788d45cc869f36b34d9b9791c05cd7b3e83`.

Provas específicas do fonte:
- `handle_running_containers`: `list_containers(all=false, filters)`; para cada resultado lê `container.id.unwrap()` e `container.names.unwrap()`.
- Event stream: `event.action.unwrap()`, `event.actor.take().unwrap()`, `actor.id.unwrap()`, `actor.attributes.unwrap()`; para `start/unpause`, consulta `attributes.get("name")`.
- `ContainerMetadata::from_details`: `details.config.unwrap()`, `details.name.unwrap()`, `details.created.unwrap()`, `config.labels.unwrap_or_default()` e `config.image.unwrap()`.
- Logs: `LogsOptionsBuilder::new().follow(true).stdout(true).stderr(true).since(info.log_since() as i32).timestamps(true)`. Portanto **`follow=true` é um requisito**, não uma opção que pode ser silenciosamente transformada em leitura finita.
- Documentação de operação: https://vector.dev/docs/reference/configuration/sources/docker_logs/ .

## Alterações do R6N — somente novos arquivos

1. `src/r6n-vector-v053-contract.mjs` — módulo independente, **sem imports, I/O, sockets, Docker CLI, subprocessos ou servidor**. Todas as operações são planejamento **INERTE** ou projeções de objetos falsos. `planR6NVectorGet` descreve `GET` para listagem de containers, `EVENTS` contínuos, `INSPECT`, `LOGS` com `follow=true`, `since`, `stdout`, `stderr`, `timestamps`, `until=0`, `tail=all`, além de `/_ping` e `/version`. Esses métodos retornam apenas `{inert:true,method:'GET',kind,path,stream}`; **não emitem bytes na rede**. Path upstream é calculado usando somente o ID interno validado; a identidade exposta ao Vector é um ID falso fixo.
2. `projectR6NList`: somente um ID autorizado; `Names` obrigatório, labels de titularidade/nonce/run/role validados, saída `Id`, `Names`, `Image`, `Labels` fixos e sintéticos. Outsiders são omitidos; duplicação ou prova inconsistente falha.
3. `projectR6NInspect`: confere ID/sha256 de configuração da imagem/`Config.Image` de manifesto, `Name`, `Created` recente, usuário não-root, `NetworkMode=none`, `ReadonlyRootfs`, `Privileged=false`, `CapDrop=ALL`, limites RAM/CPU/PIDs, `RestartCount=0`, nenhum mount e labels exatos. Emite os campos usados pelo `ContainerMetadata::from_details` do Vector — `Config.Image`, `Config.Labels`, `Name`, `Created` — como **valores puramente artificiais**; nunca retorna `Env`, IP, paths, IDs reais ou payload bruto.
4. `projectR6NEvent`: somente ações `start`, `unpause`, `die` e `pause` de um ID permitido. Emite `Type`, `Action`, `Actor: { ID, Attributes: { name } }`, `time`, preenchendo o objeto `Attributes` requerido pelo Vector. Atributos externos não são propagados.
5. `tests/r6n-vector-v053-contract.test.mjs` — **24 testes nativos do Node** para request planner `follow=true`/eventos/lista/inspect, rejeição de `POST`, `all=true`, outsider, filtros e datas malformados, ausência de `Actor.Attributes`, validação das políticas de container e canários de sigilo, além de teste estático de ausência de I/O.
6. Este documento. **Nenhum arquivo aprovado R6B–R6M é modificado**. Nenhum workflow novo ou alteração no YAML anterior.

## Limitações materiais e bloqueios

Este R6N **NÃO corrige o gateway antigo em execução**, nem constitui compatibilidade end-to-end:
- O novo planejador é **inativo e não é usado pelo R6F/R6G**. O R6F segue impondo `follow=false`; R6G continua retornando respostas finitas. O R6N descreve a rota que seria necessária, **mas não implementa um HTTP streaming server, nem pausa/resume real, mTLS operacional, reenquadramento de logs com fluxo infinito ou reconexão**. Projetar `follow=true` não é operar `follow=true`.
- `projectR6NEvent` devolve **um objeto de evento**; não implementa a stream NDJSON de eventos Docker, nem backpressure e cancelamento reais. O Vector **não foi iniciado** para consumir esse JSON.
- O JSON de `projectR6NInspect` foi construído com base nos campos lidos pelo código-fonte Rust da versão 0.53.0; **não foi desserializado pelo Bollard nem executado pelo Vector Rust**. Outros campos ou peculiaridades de API podem estar faltando.
- O planejador limita `since` à janela sintética de 600 segundos e aceita opções estruturadas específicas. O daemon real e a biblioteca Bollard podem usar outra ordem/representação ou parâmetros adicionais; todo desvio deve retornar BLOCKED, não abrir permissões.
- Digests de imagem usados no teste são **fictícios**; não houve consulta nem pull de registro e não existe prova de daemon. O modelo recebe objetos de inspeção simulados, não evidências independentes do Docker.
- Ausência de ledger durável, provisionamento idempotente e teardown do daemon. Nenhum teste real de `Vector 0.53.0 + Docker`, TLS SAN/fingerprint, streaming de eventos ou logs, higiene de recursos, containers estrangeiros ou recuperação do Windows.
- A tag `v0.53.0` é fixa; não há licença ou código de terceiros copiado: somente estudo da API e código original do laboratório.

## Evidências e gates

| Verificação | Estado |
| --- | --- |
| R6L proprietário Windows, suíte total offline | **179/179 PASS** |
| R6M revisão de arquitetura no GitHub | PASS documental |
| R6N testes específicos com Node 22.16.0 local | **24/24 PASS** |
| Hashes Git dos dois arquivos executados vs publicação | Confirmar na revisão do PR |
| R6N suíte combinada no Windows, commit publicado | **PENDING 203/203** |
| Compatibilidade real do Vector (Bollard, eventos e logs contínuos) | **BLOCKED** |
| GitHub Actions, Docker real, merge, Windows HML, produção | **NÃO EXECUTADOS / NO-GO** |

**Próxima prova válida:** executar a suíte offline completa `203/203` em clone independente e fixado do R6N; depois, para um GO real, implementar um adapter read-only de streaming e esquema de eventos fiel à versão 0.53.0, com revisão de vulnerabilidades, ledger persistente, isolamento do runner, mTLS e autorização adicional específica. Não reproduzir os dois Vector originais nem habilitar `host.docker.internal:2375`.
