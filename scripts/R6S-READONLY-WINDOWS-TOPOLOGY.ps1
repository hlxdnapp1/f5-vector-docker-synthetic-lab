# EXATA R24-03W R6S: strictly READ-ONLY Windows Docker topology diagnosis.
# Does not access raw logs, start/stop/exec containers, change Docker, SQL or HML.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-ReadDocker {
    param([string[]]$DockerArguments, [string]$Step)
    $captured = & $script:dockerExe @DockerArguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "R6S_BLOCKED_DOCKER_$Step" }
    return ($captured | Out-String)
}
function Get-Field {
    param($Object, [string]$Name)
    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}
function Has-Label {
    param($Labels, [string]$Name)
    if ($null -eq $Labels) { return $false }
    return ($null -ne $Labels.PSObject.Properties[$Name])
}
function Classify-Host {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return 'MISSING' }
    if ($Value -match '^http://host\.docker\.internal:2375/?$') { return 'HTTP_2375_UNSAFE' }
    if ($Value -match '^https://') { return 'HTTPS_UNVERIFIED' }
    if ($Value -match '^http://') { return 'HTTP_UNENCRYPTED' }
    if ($Value -match '^tcp://') { return 'TCP_SCHEME_UNVERIFIED' }
    if ($Value -match '^unix://') { return 'UNIX_PATH_UNVERIFIED' }
    if ($Value -match '^npipe://') { return 'WINDOWS_NAMED_PIPE_UNVERIFIED' }
    return 'UNKNOWN_UNVERIFIED'
}
$script:dockerExe = (Get-Command docker -CommandType Application -ErrorAction Stop).Source
$root = Join-Path $env:USERPROFILE 'Downloads'
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw 'R6S_BLOCKED_DOWNLOADS_MISSING' }
$runName = 'EXATA_R6S_TOPOLOGY_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '_' + [guid]::NewGuid().ToString('N').Substring(0,8)
$outputDir = Join-Path $root $runName
if (Test-Path -LiteralPath $outputDir) { throw 'R6S_BLOCKED_DIRECTORY_EXISTS' }

# Fail closed: never query a remote/unknown daemon.
$envDockerHost = [Environment]::GetEnvironmentVariable('DOCKER_HOST', 'Process')
if (-not [string]::IsNullOrWhiteSpace($envDockerHost) -and
    $envDockerHost -notmatch '^npipe:////\./pipe/(docker_engine|dockerDesktopLinuxEngine)$') {
    throw 'R6S_BLOCKED_DOCKER_HOST_NOT_LOCAL_NPIPE'
}
$contextName = (Invoke-ReadDocker -DockerArguments @('context','show') -Step 'CONTEXT_SHOW').Trim()
if ($contextName -notmatch '^[a-zA-Z0-9_.-]{1,100}$') { throw 'R6S_BLOCKED_CONTEXT_NAME' }
$endpoint = (Invoke-ReadDocker -DockerArguments @('context','inspect',$contextName,'--format','{{.Endpoints.docker.Host}}') -Step 'CONTEXT_INSPECT').Trim()
if ($endpoint -notmatch '^npipe:////\./pipe/(docker_engine|dockerDesktopLinuxEngine)$') {
    throw 'R6S_BLOCKED_CONTEXT_NOT_LOCAL_NPIPE'
}
$dockerVersion = (Invoke-ReadDocker -DockerArguments @('version','--format','{{.Server.Version}}') -Step 'VERSION').Trim()
if ($dockerVersion -notmatch '^\d+\.\d+\.[0-9]+') { throw 'R6S_BLOCKED_ENGINE_VERSION' }
$engineOS = (Invoke-ReadDocker -DockerArguments @('info','--format','{{.OSType}}') -Step 'ENGINE_OS').Trim()
if ($engineOS -ne 'linux') { throw 'R6S_BLOCKED_ENGINE_NOT_LINUX' }

$rawList = Invoke-ReadDocker -DockerArguments @('ps','--all','--format','{{json .}}') -Step 'CONTAINER_LIST'
$entries = New-Object 'System.Collections.Generic.List[object]'
foreach ($line in ($rawList -split "\r?\n")) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line.Length -gt 8192) { throw 'R6S_BLOCKED_LIST_RECORD_SIZE' }
    try { $entry = ConvertFrom-Json -InputObject $line -ErrorAction Stop }
    catch { throw 'R6S_BLOCKED_LIST_JSON' }
    if (-not (Get-Field -Object $entry -Name 'Names')) { throw 'R6S_BLOCKED_LIST_NAME_MISSING' }
    $entries.Add($entry)
}
$targets = @('supabase_vector_rc4-local-hml','supabase_vector_homologacao-v349198')
$vectors = New-Object 'System.Collections.Generic.List[object]'
foreach ($name in $targets) {
    $matched = @($entries | Where-Object { (Get-Field -Object $_ -Name 'Names') -eq $name })
    if ($matched.Count -gt 1) { throw 'R6S_BLOCKED_DUPLICATE_VECTOR_NAME' }
    if ($matched.Count -eq 0) {
        $vectors.Add([pscustomobject]@{name=$name;present=$false;state='MISSING';docker_host='UNKNOWN';unix_socket_mount=$false;tls_verify_present=$false;tls_cert_path_present=$false;compose_label=$false;compose_config_files_label=$false;mount_count=0;network='UNKNOWN';restart_count=$null})
        continue
    }
    $raw = Invoke-ReadDocker -DockerArguments @('container','inspect',$name) -Step 'VECTOR_INSPECT'
    if ($raw.Length -gt 512000) { throw 'R6S_BLOCKED_INSPECT_SIZE' }
    try { $parsed = ConvertFrom-Json -InputObject $raw -ErrorAction Stop }
    catch { throw 'R6S_BLOCKED_INSPECT_JSON' }
    $rows = @($parsed)
    if ($rows.Count -ne 1) { throw 'R6S_BLOCKED_INSPECT_COUNT' }
    $v = $rows[0]
    $config = Get-Field -Object $v -Name 'Config'
    $state = Get-Field -Object $v -Name 'State'
    $hostConfig = Get-Field -Object $v -Name 'HostConfig'
    if ($null -eq $config -or $null -eq $state -or $null -eq $hostConfig) { throw 'R6S_BLOCKED_INSPECT_SHAPE' }
    $envValues = @((Get-Field -Object $config -Name 'Env') | Where-Object { $null -ne $_ })
    $dockerHostValues = @($envValues | Where-Object { $_ -is [string] -and $_.StartsWith('DOCKER_HOST=') })
    if ($dockerHostValues.Count -gt 1) { throw 'R6S_BLOCKED_MULTIPLE_VECTOR_DOCKER_HOSTS' }
    $vectorHost = ''
    if ($dockerHostValues.Count -eq 1) { $vectorHost = $dockerHostValues[0].Substring(12) }
    $tlsVerify = @($envValues | Where-Object { $_ -is [string] -and $_.StartsWith('DOCKER_TLS_VERIFY=') }).Count -gt 0
    $tlsCert = @($envValues | Where-Object { $_ -is [string] -and $_.StartsWith('DOCKER_CERT_PATH=') }).Count -gt 0
    $mounts = @((Get-Field -Object $v -Name 'Mounts') | Where-Object { $null -ne $_ })
    $socket = @($mounts | Where-Object { (Get-Field -Object $_ -Name 'Destination') -eq '/var/run/docker.sock' }).Count -gt 0
    $labels = Get-Field -Object $config -Name 'Labels'
    $networkMode = [string](Get-Field -Object $hostConfig -Name 'NetworkMode')
    $networkClass = if ($networkMode -in @('none','bridge','host')) { $networkMode } else { 'CUSTOM_OR_UNVERIFIED' }
    $status = [string](Get-Field -Object $state -Name 'Status')
    if ($status -notin @('created','restarting','running','removing','paused','exited','dead')) { $status = 'UNKNOWN' }
    $vectors.Add([pscustomobject]@{
        name=$name;present=$true;state=$status
        docker_host=(Classify-Host -Value $vectorHost)
        unix_socket_mount=$socket
        tls_verify_present=$tlsVerify
        tls_cert_path_present=$tlsCert
        compose_label=(Has-Label -Labels $labels -Name 'com.docker.compose.project')
        compose_config_files_label=(Has-Label -Labels $labels -Name 'com.docker.compose.project.config_files')
        mount_count=$mounts.Count
        network=$networkClass
        restart_count=(Get-Field -Object $v -Name 'RestartCount')
    })
}
$protected = New-Object 'System.Collections.Generic.List[object]'
foreach ($kind in @('db','analytics','studio','storage')) {
    $regex = '^supabase_' + $kind + '_'
    $group = @($entries | Where-Object { (Get-Field -Object $_ -Name 'Names') -match $regex })
    $running = @($group | Where-Object { (Get-Field -Object $_ -Name 'State') -eq 'running' }).Count
    $healthy = @($group | Where-Object { (Get-Field -Object $_ -Name 'Status') -match '\(healthy\)' }).Count
    $protected.Add([pscustomobject]@{category=$kind;observed=$group.Count;running=$running;healthy=$healthy})
}

$tcpProbe = 'UNAVAILABLE'
$listeners = @()
if ($null -ne (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
    try {
        $connections = @(Get-NetTCPConnection -State Listen -ErrorAction Stop |
            Where-Object { $_.LocalPort -in @(2375,2376) })
        $tcpProbe = 'READ_OK'
        foreach ($conn in $connections) {
            $scope = if ($conn.LocalAddress -in @('127.0.0.1','::1')) { 'LOOPBACK' }
                elseif ($conn.LocalAddress -in @('0.0.0.0','::')) { 'ALL_INTERFACES' }
                else { 'OTHER' }
            $listeners += [pscustomobject]@{port=[int]$conn.LocalPort;scope=$scope}
        }
    } catch { $tcpProbe = 'BLOCKED_READ_FAILURE' }
}
$bothStopped = (@($vectors | Where-Object { $_.state -eq 'exited' }).Count -eq 2)
$unsafe = (@($vectors | Where-Object { $_.docker_host -in @('HTTP_2375_UNSAFE','HTTP_UNENCRYPTED') }).Count -gt 0)
$report = [ordered]@{
    gate='R24-03W-R6S';executed_at=(Get-Date).ToString('o')
    evidence_mode='READ_ONLY_NO_DOCKER_MUTATIONS'
    docker_context_local_npipe=$true;engine_os='linux';engine_version=$dockerVersion
    discovered_containers=$entries.Count
    vectors=@($vectors.ToArray());protected_categories_observed=@($protected.ToArray())
    host_listener_read=$tcpProbe;host_listeners_2375_2376=@($listeners)
    vector_exited_both=$bothStopped;unencrypted_vector_docker_host_detected=$unsafe
    unix_socket_option_A='NOT_PROVEN';mtls_option_B='NOT_PROVEN'
    recommended_option_C='KEEP_CONTAINMENT_UNTIL_APPROVAL'
    external_vector_connectivity='NOT_TESTED';hml='NO_GO';production='NO_GO'
}
New-Item -ItemType Directory -Path $outputDir | Out-Null
$path = Join-Path $outputDir 'R24_03W_R6S_TOPOLOGY_RESULT.json'
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $path -Encoding UTF8
$hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
Write-Host 'R6S DIAGNOSTICO READ-ONLY: PASS' -ForegroundColor Green
Write-Host ('VECTOR_CONTIDOS_2=' + $bothStopped)
Write-Host ('DOCKER_HOST_HTTP_INSEGURO=' + $unsafe)
foreach ($v in $vectors) { Write-Host ('VECTOR=' + $v.name + ' STATE=' + $v.state + ' HOST_CLASS=' + $v.docker_host + ' UNIX_MOUNT=' + $v.unix_socket_mount) }
foreach ($g in $protected) { Write-Host ('PROTECTED_CATEGORY=' + $g.category + ' OBSERVED=' + $g.observed + ' RUNNING=' + $g.running + ' HEALTHY=' + $g.healthy) }
Write-Host ('HOST_LISTENERS_2375_2376=' + $listeners.Count + ' TCP_CHECK=' + $tcpProbe)
Write-Host 'TOPOLOGY_A/B: NOT_PROVEN'
Write-Host 'RECOMMENDATION: KEEP_CONTAINMENT'
Write-Host ('REPORT=' + $path)
Write-Host ('SHA256=' + $hash)
Write-Host 'DOCKER_MUTATIONS / GITHUB_ACTIONS / SQL / HML / PRODUCAO: NAO EXECUTADOS'
