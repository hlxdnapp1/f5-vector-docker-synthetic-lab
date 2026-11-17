# EXATA R24-03W R6Z — Pré-requisitos para VM de laboratório Vector, sem custo adicional de licenças

**Data:** 16/11/2026. **Governança EXATA:** [issue #315](https://github.com/hlxdnapp1/Sistema_Automacao_Comercial/issues/315). **Base:** R6Y branch `review/r6y-vector-v053-secure-lab-readiness-20261116`, commit `5956a4f6f86bca696744a2145e793012b409d0fd` ([Draft #24](https://github.com/hlxdnapp1/f5-vector-docker-synthetic-lab/pull/24)). Repo público de LAB isolado `hlxdnapp1/f5-vector-docker-synthetic-lab`; ERP principal continua `hlxdnapp1/Sistema_Automacao_Comercial`.

## Objetivo

O proprietário perguntou como **criar ambiente de laboratório independente para testar o Vector real 0.53.0 sem arriscar os dois stacks Docker/Supabase em HML**.

**Caminho recomendado se recursos permitirem:** Hyper-V integrado ao Windows 11 Pro, VM **Ubuntu Server 24.04 LTS**, Docker Engine instalado DENTRO do Ubuntu, daemon Linux próprio sem conexão com Docker Desktop host, imagem Vector `0.53.0-alpine` `linux/amd64` imutavelmente pinada, dados fictícios e broker HTTP limitado a GET com mTLS. Idealmente usar switch virtual privado/interno e controlar explicitamente qualquer egress necessário para pacotes oficiais; **nunca expor Docker TCP 2375/2376 nem montar o socket host**. Ubuntu e Docker Engine são gratuitos, Hyper-V faz parte do Windows Pro; custos indiretos de hardware/energia/armazenamento e eventual acesso internet podem existir. Novo container no Docker Desktop atual **NÃO satisfaz isolamento de daemon**.

Guia Microsoft: [Hyper-V requisitos e ativação](https://learn.microsoft.com/pt-br/windows-server/virtualization/hyper-v/get-started/install-hyper-v), [requisitos de hardware](https://learn.microsoft.com/pt-br/windows-server/virtualization/hyper-v/host-hardware-requirements), [NAT de Hyper-V](https://learn.microsoft.com/pt-br/windows-server/virtualization/hyper-v/setup-nat-network). Docker: [instalação oficial de Engine no Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Não ativar Hyper-V automaticamente: habilitar o recurso pode exigir **reinicialização do host** e afetar a operação atual, então precisa de gate e autorização específicos.

## Evidência prévia

R6R Node 271/271 PASS offline. R6S–R6U em Windows somente leitura; 2/2 Vector `exited`, `DOCKER_HOST=http://host.docker.internal:2375` sem TLS; 8/8 serviços protegidos saudáveis na última leitura R6W. R6X metadados OCI somente leitura PASS: `0.53.0-alpine`, `linux/amd64`, tag e digest público correspondentes, imagem local compartilhada, relatório informado `R24_03W_R6X_RESULT.json`, SHA-256 `A3F01CD1064E6A2270A2AEAEA2D7202A0F3216E2CD02FFA3D10C102B60B6024A` (arquivo não transferido para recálculo independente). R6Y PR Draft somente documento `5956a4f6f86bca696744a2145e793012b409d0fd`. Nenhuma execução real de Vector em container, gateway mTLS ou criação de VM autorizada.

## Script R6Z — somente leitura

`scripts/R6Z-READONLY-HYPERV-HOST-PREFLIGHT.ps1` não usa Docker/WSL e **NÃO** habilita Hyper-V, não instala funções, não reinicia o Windows, não altera rede, não cria VMs, não baixa ISO. Lê apenas via CIM as edições Windows, processadores lógicos e virtualização, memória física total/disponível e **letras de discos fixos + espaço livre**; tenta ler o estado do recurso Hyper-V, quantidades de VM/switch existente e NAT somente quando comandos estão disponíveis. Não exibe nomes de VMs, usuário, caminho de configuração, IPs ou dados privados. Gera JSON sanitizado e SHA-256 em nova pasta Downloads.

**Guardas conservadoras para sequer considerar a fase de criação:** Windows 10/11 Pro, Enterprise ou Education; Hyper-V já `Enabled`; virtualização disponível; **4+ processadores lógicos**, **16 GiB RAM física total**, **6 GiB de RAM disponível no momento**, **ao menos um disco com 70 GiB livres** para ISO/VHDX/caches/snapshots. Planejamento inicial: VM 2 vCPUs, 4 GiB RAM e VHDX com máximo de 32 GiB; ajustar conforme monitoramento, sem prejudicar oito serviços. A exigência de disco é propositalmente conservadora; análise anterior indicou somente ~31 GiB livres em C:, então esse disco pode ficar **BLOCKED**. Verificar outras unidades antes de qualquer criação.

Se pré-requisitos não forem atendidos, status do diagnóstico ainda pode ser **PASS_READ_ONLY**, mas resultado `VM_RESOURCE_ASSESSMENT=BLOCKED_...`. Isso não autoriza habilitar Hyper-V, reiniciar o Windows, mover instalações existentes ou criar VHDX mesmo quando recursos estiverem suficientes. Resultado `ELIGIBLE_FOR_SEPARATE_APPROVAL_NOT_PROVISIONED` significa **somente elegibilidade para propor**.

## Próximas etapas quando houver capacidade e autorização separada

1. Backup comprovado da stack atual e verificação independente da saúde 8/8; identificar drive livre, origem oficial Ubuntu ISO e assinatura/hash SHA256.
2. Se Hyper-V não estiver habilitado, **parar para avaliação**: habilitar/reiniciar o Windows é ação de risco em ambiente com serviços ativos, não aprovada.
3. Criar VM exclusiva sem compartilhamento de VHDX, pastas, redes Docker ou certificados da stack; Docker Engine dentro da VM, escuta Unix local, rede NAT com regras restritivas; registro/rollback dos recursos VM criados.
4. Verificar digest real de `0.53.0-alpine` e `vector --version` exclusivamente dentro da VM isolada com dados fictícios, sem entrar nos Vector existentes.
5. Implementar e homologar broker mTLS que **não repasse acesso irrestrito** ao Docker API, bloqueando POST/PUT/PATCH/DELETE e GET não autorizados, isolando eventos/logs entre projetos; testes de streaming, backpressure, replay e falha fechada.
6. Somente com gates reais PASS, planejar **separadamente** reparo HML dos dois Vector; backup/rollback do ambiente HML, saúde 8/8 antes/depois e autorização específica. Nunca produção automática.

## Estado

R6Z é **somente pré-vistoria**. GitHub PR Draft, script Windows ainda NOT_RUN. Nenhuma criação de VM, instalação Docker/Hyper-V ou nova bateria de simulação. GitHub Actions, SQL, alterações em oito serviços, HML, fiscal e produção **NO-GO**.
