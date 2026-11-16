# EXATA R24-03W R6H — Ciclo de vida e limpeza: SIMULAÇÃO SOMENTE EM MEMÓRIA

**Data:** 2026-11-16. **Escopo autorizado:** preparar/revisar código sintético em branch/PR Draft, sem merge, GitHub Actions, Docker real, HML, SQL, fiscal ou produção. **Governança:** [issue #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315).

## Base homologada e fronteira

- Repositório público separado: `hlxdnapp1/f5-vector-docker-synthetic-lab`.
- R6G preservado no commit `a1de03c0c4af6724671ca9410e373b2924d712df`, PR Draft #6.
- Evidência do proprietário no Windows: R6B+C+D+F+G **77/77 PASS** offline; relatório `R24_03W_R6G_RESULT.json`, SHA-256 `66119C3BAE2353246EB25EA8F70FD7D3D4887E73FF7C79338292F692820CEB32`.
- Toda homologação até R6G ocorreu sem executar GitHub Actions ou acessar um Docker real.

## R6H: exatamente o que foi acrescentado

1. `src/r6h-offline-synthetic-lifecycle.mjs` implementa um **simulador de Docker inteiramente em memória**. Não importa `node:http`, `node:net`, CLI Docker, ferramentas de processo, arquivos ou bibliotecas externas. **Ele não pode criar nem remover containers reais.**
2. O manifesto exige owner público exato, nonce hexadecimal de 32 caracteres, digest sintético `sha256`, identificador de execução numérico e relógio fictício informado. Produz apenas os IDs artificiais `c` repetido 64 vezes (autorizado) e `d` repetido 64 vezes (outsider). Recursos simulados usam usuário não-root, `NetworkMode=none`, rootfs somente leitura, ausência de mounts, privilégios desativados, cap drop, limites CPU/RAM/PIDs, sem restart.
3. A classe `OfflineFakeDocker` guarda apenas objetos em um `Map` de memória, com rótulos `R6H_MOCK_ONLY`; não conhece URL, socket, daemon nem credenciais. O controlador rejeita um transporte genérico.
4. O controlador conserva um registro dos IDs exatamente simulados. Sua limpeza só atua sobre esses IDs e confere nonce + runId. Objetos estrangeiros permanecem intocados. Nova execução de create durante `ACTIVE` não duplica recursos; cleanup durante `CLEANED` não repete remoções.
5. Falhas injetadas durante criação ou remoção levam a `FAILED` / `CLEANUP_FAILED`, sem PASS falso. Repetir a limpeza só é permitido após correção do erro simulado; reutilizar o controlador já limpo é bloqueado.
6. `tests/r6h-offline-synthetic-lifecycle.test.mjs` inclui **14 testes Node** de manifest, limites, identidade, negação de transporte real, idempotência, isolamento de outsider, rollback de falha parcial e erro de limpeza.

## Evidências e limites

- Node 22.16.0 neste laboratório isolado: sintaxe dos dois arquivos PASS; testes específicos R6H **14/14 PASS**, 0 falhas e 0 skips; SHA-1 dos dois arquivos comparado com blobs GitHub após publicação.
- A suíte total R6B+C+D+F+G+H deveria totalizar **91 testes (77+14)**. **Pendente comprovação no checkout completo do commit R6H no Windows do proprietário**.
- Nenhum workflow novo ou alterado: o único YAML permanece o manual OFFLINE de R6F, em Draft. O GitHub Actions não foi executado.
- Aprovado apenas o comportamento de um **simulador sem efeitos colaterais**. Não existe código de provisionamento/limpeza do Docker real, imagem puxada por digest, identidade real do daemon, checkpoint durável, proteção de crash do processo, nem prova de rollback em VM efêmera.
- Um registro somente em memória **não sobreviveria a uma falha de processo**; um futuro provisionador real deve manter ledger recuperável, com IDs e rótulos verificados e limpeza restrita a objetos comprovadamente criados pelo mesmo job, sem `docker system prune`, sem interferir no HML.
- Os mocks R6H têm o rótulo `R6H_MOCK_ONLY`, distinto do rótulo exigido pelo R6G `R6G_ONLY`. **Não existe integração automática entre os dois**, nem esta etapa comprova que um futuro Docker Engine fornecerá metadados compatíveis com o atestado R6G. Não afirmar compatibilidade com daemon real ou Vector.
- O R6H não fornece um processo de supervisão, rollback de containers reais ou integração com o Vector oficial.

## Gates futuros, sem autorização de execução

1. Homologar 91/91 testes offline a partir de clone isolado do commit R6H.
2. Analisar a integração entre manifesto de criação real e atestado R6G, com identidade do daemon atestada independentemente.
3. Projetar ledger durável e rollback por recurso criado, sem ampliar a permissão para tocar no servidor Windows.
4. Auditar code paths, image digest real, superfície do socket, streaming, mTLS, tempo, processo e mecanismo de encerramento.
5. Exigir autorização **específica e separada** para workflow em `main`, GitHub Actions ou acesso Docker real; mudanças HML/produção têm gates próprios.

**Estado:** R6G `PASS_OFFLINE_77/77_WINDOWS`; R6H `PASS_OFFLINE_14/14_LOCAL`, conjunto 91/91 `PENDING_WINDOWS`; Docker real `BLOCKED`; HML/produção `NO-GO`.
