# EXATA R24-03W R6W — Read-only identity of the two EXISTING Vector images.
# No Docker start/stop/exec/logs/pull; no Supabase CLI; no SQL; no container mutation.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$R6UReportPath)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest

function Read-DockerSafe {
    param([string[]]$DockerArguments,[string]$Step)
    $response = & $script:DockerExe @DockerArguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw ('R6W_BLOCKED_DOCKER_' + $Step) }
    return ($response | Out-String).Trim()
}

$reportExpected='A3490DC76815C1B77979619DEC434C3AF4BBAC932D97D0B52C8DE3FF85704737'
$names=@('supabase_vector_rc4-local-hml','supabase_vector_homologacao-v349198')
$protectedKinds=@('db','analytics','studio','storage')

if (-not (Test-Path -LiteralPath $R6UReportPath -PathType Leaf)) {
    throw 'R6W_BLOCKED_R6U_REPORT_MISSING'
}
$length=(Get-Item -LiteralPath $R6UReportPath).Length
if ($length -lt 400 -or $length -gt 65536) { throw 'R6W_BLOCKED_R6U_SIZE' }
$foundHash=(Get-FileHash -LiteralPath $R6UReportPath -Algorithm SHA256).Hash
if ($foundHash -ne $reportExpected) { throw 'R6W_BLOCKED_R6U_HASH' }
try {
    $prior=ConvertFrom-Json -InputObject (Get-Content -LiteralPath $R6UReportPath -Raw -Encoding UTF8) -ErrorAction Stop
} catch { throw 'R6W_BLOCKED_R6U_JSON' }
if ($prior.gate -ne 'R24-03W-R6U' -or $prior.installed_supabase_cli_version -ne '2.117.0' -or
    $prior.chosen_option -ne 'C_KEEP_VECTOR_CONTAINED' -or
    $prior.ownership -ne 'INFERRED_NOT_PROVEN' -or
    $prior.source_baseline_sha256 -ne '91913CF2DF18099390BD4334CB657ABFAB9EFDD4D35F40DB258E6BF4DDB16DCF') {
    throw 'R6W_BLOCKED_R6U_BASELINE'
}
$previous=@($prior.results | Where-Object { $null -ne $_ })
if ($previous.Count -ne 2) { throw 'R6W_BLOCKED_R6U_COUNT' }
foreach($name in $names) {
    $matched=@($previous | Where-Object { $_.target -eq $name })
    if ($matched.Count -ne 1 -or $matched[0].state -ne 'exited' -or
        $matched[0].supabase_cli_project_present -ne $true -or
        $matched[0].compose_project_label -ne $true) {
        throw 'R6W_BLOCKED_R6U_VECTOR_BASELINE'
    }
}

$envHost=[Environment]::GetEnvironmentVariable('DOCKER_HOST','Process')
if (-not [string]::IsNullOrWhiteSpace($envHost) -and
    $envHost -notmatch '^npipe:////\./pipe/(docker_engine|dockerDesktopLinuxEngine)$') {
    throw 'R6W_BLOCKED_REMOTE_DOCKER_HOST'
}
$dockerMatches=@(Get-Command -Name 'docker.exe' -CommandType Application -All -ErrorAction Stop |
    Where-Object { $_.Source -is [string] -and
        [System.IO.Path]::GetFileName($_.Source) -ieq 'docker.exe' -and
        (Test-Path -LiteralPath $_.Source -PathType Leaf) } |
    Select-Object -ExpandProperty Source -Unique)
if ($dockerMatches.Count -ne 1) { throw 'R6W_BLOCKED_DOCKER_EXE' }
$script:DockerExe=[string]$dockerMatches[0]

$context=Read-DockerSafe -DockerArguments @('context','show') -Step 'CONTEXT'
if ($context -notmatch '^[a-zA-Z0-9_.-]{1,100}$') {
    throw 'R6W_BLOCKED_CONTEXT_NAME'
}
$endpoint=Read-DockerSafe -DockerArguments @('context','inspect',$context,'--format','{{.Endpoints.docker.Host}}') -Step 'ENDPOINT'
if ($endpoint -notmatch '^npipe:////\./pipe/(docker_engine|dockerDesktopLinuxEngine)$') {
    throw 'R6W_BLOCKED_NONLOCAL_CONTEXT'
}
$engine=Read-DockerSafe -DockerArguments @('info','--format','{{.OSType}}') -Step 'ENGINE_OS'
if ($engine -ne 'linux') { throw 'R6W_BLOCKED_NOT_LINUX_ENGINE' }

$records=New-Object 'System.Collections.Generic.List[object]'
foreach($name in $names) {
    $status=Read-DockerSafe -DockerArguments @('container','inspect','--format','{{.State.Status}}',$name) -Step 'VECTOR_STATE'
    if ($status -ne 'exited') { throw 'R6W_BLOCKED_VECTOR_STATE_CHANGED' }
    $reference=Read-DockerSafe -DockerArguments @('container','inspect','--format','{{.Config.Image}}',$name) -Step 'VECTOR_IMAGE_REFERENCE'
    if ($reference.Length -lt 3 -or $reference.Length -gt 256 -or
        $reference -notmatch '^[A-Za-z0-9][A-Za-z0-9_.:/@+-]*$') {
        throw 'R6W_BLOCKED_IMAGE_REFERENCE_SHAPE'
    }
    $containerImageId=Read-DockerSafe -DockerArguments @('container','inspect','--format','{{.Image}}',$name) -Step 'VECTOR_IMAGE_ID'
    if ($containerImageId -cnotmatch '^sha256:[a-f0-9]{64}$') {
        throw 'R6W_BLOCKED_CONTAINER_IMAGE_ID'
    }
    # Read-only LOCAL image inspection; never pull or change image tags.
    $localImageId=Read-DockerSafe -DockerArguments @('image','inspect','--format','{{.Id}}',$reference) -Step 'LOCAL_IMAGE_INSPECT'
    if ($localImageId -cne $containerImageId) {
        throw 'R6W_BLOCKED_LOCAL_IMAGE_ID_MISMATCH'
    }
    # Never print the raw reference if it is not a known public Vector repository.
    $imageFamily='UNKNOWN_OR_PRIVATE'
    $version='UNVERIFIED'
    if ($reference -match '^(?:docker\.io/)?timberio/vector:(?<version>v?[0-9]+\.[0-9]+\.[0-9]+(?:[-.][A-Za-z0-9]+)*)$') {
        $imageFamily='TIMBERIO_VECTOR'
        $version=$Matches['version']
    } elseif ($reference -match '^ghcr\.io/supabase/cli/vector:(?<version>v?[0-9]+\.[0-9]+\.[0-9]+(?:[-.][A-Za-z0-9]+)*)$') {
        $imageFamily='SUPABASE_CLI_VECTOR'
        $version=$Matches['version']
    }
    $matchesR6Reference=($version -match '^v?0\.53\.0(?:-|$)')
    $records.Add([pscustomobject][ordered]@{
        target=$name
        state='exited'
        image_family=$imageFamily
        vector_image_version=$version
        image_config_sha256=$containerImageId
        same_version_as_r6n_lab=$matchesR6Reference
        actual_vector_binary_version='NOT_EXECUTED'
        vector_logs='NOT_READ'
    })
}
$psRaw=Read-DockerSafe -DockerArguments @('ps','--all','--format','{{.Names}}|{{.State}}|{{.Status}}') -Step 'PROTECTED_STATUS'
if ($psRaw.Length -gt 524288) { throw 'R6W_BLOCKED_CONTAINER_LIST_SIZE' }
$entries=New-Object 'System.Collections.Generic.List[object]'
foreach ($line in ($psRaw -split '\r?\n')) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line.Length -gt 4096) { throw 'R6W_BLOCKED_CONTAINER_LIST_LINE' }
    $fields=$line.Split('|')
    if ($fields.Count -ne 3) { throw 'R6W_BLOCKED_CONTAINER_LIST_FORMAT' }
    $entries.Add([pscustomobject]@{name=$fields[0];state=$fields[1];status=$fields[2]})
}
foreach ($kind in $protectedKinds) {
    $group=@($entries | Where-Object { $_.name -match ('^supabase_' + $kind + '_') })
    $healthy=@($group | Where-Object {
        $_.state -eq 'running' -and $_.status -match '\(healthy\)'
    })
    if ($group.Count -ne 2 -or $healthy.Count -ne 2) {
        throw ('R6W_BLOCKED_PROTECTED_HEALTH_' + $kind)
    }
}

$matchCount=@($records | Where-Object { $_.same_version_as_r6n_lab }).Count
$coverage=if ($matchCount -eq 2) { 'TAG_MATCH_ONLY_NOT_RUNTIME_PROOF' } else { 'LAB_VERSION_MISMATCH_OR_UNVERIFIED' }
$report=[ordered]@{
    gate='R24-03W-R6W'
    executed_at=(Get-Date).ToString('o')
    evidence='LOCAL_DOCKER_INSPECT_ONLY'
    r6u_report_sha256=$reportExpected
    supabase_cli_reported_version='2.117.0'
    docker_context='LOCAL_NPIPE_CHECKED'
    vector_count=$records.Count
    vectors=@($records.ToArray())
    protected_health_current='8_OF_8_RUNNING_HEALTHY'
    r6n_lab_vector_reference='v0.53.0'
    lab_coverage=$coverage
    vector_real_executed=$false
    docker_changes=$false
    option='C_KEEP_CONTAINMENT'
    hml='NO_GO'
    production='NO_GO'
}
$downloads=Join-Path $env:USERPROFILE 'Downloads'
if (-not (Test-Path -LiteralPath $downloads -PathType Container)) {
    throw 'R6W_BLOCKED_DOWNLOADS'
}
$folder=Join-Path $downloads ('EXATA_R6W_IMAGE_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '_' + [guid]::NewGuid().ToString('N').Substring(0,8))
if (Test-Path -LiteralPath $folder) { throw 'R6W_BLOCKED_OUTPUT_EXISTS' }
New-Item -ItemType Directory -Path $folder | Out-Null
$reportPath=Join-Path $folder 'R24_03W_R6W_RESULT.json'
$report | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $reportPath -Encoding UTF8
$reportSha=(Get-FileHash -LiteralPath $reportPath -Algorithm SHA256).Hash

Write-Host 'EXATA R6W - IMAGENS VECTOR READ-ONLY: PASS' -ForegroundColor Green
Write-Host 'SUPABASE_CLI_V2117_PROVENANCE=STRONGLY_CORROBORATED'
Write-Host 'PROTECTED_SERVICES=8/8 HEALTHY'
foreach($item in $records) {
    Write-Host ('VECTOR=' + $item.target +
        ' IMAGE_FAMILY=' + $item.image_family +
        ' TAG_VERSION=' + $item.vector_image_version +
        ' IMAGE_CONFIG_ID=' + $item.image_config_sha256 +
        ' MATCHES_R6N_V053=' + $item.same_version_as_r6n_lab)
}
Write-Host ('VECTOR_IMAGE_LAB_COVERAGE=' + $coverage)
Write-Host ('REPORT=' + $reportPath)
Write-Host ('SHA256=' + $reportSha)
Write-Host 'CONTAINMENT=KEEP; A_UNIX/B_MTLS=NOT_PROVEN'
Write-Host 'NO START/STOP/EXEC/LOGS/PULL/SQL/HML/PRODUCTION'
