# EXATA R24-03W R6U - narrow read-only Vector provenance check.
# No docker mutation, no logs, no env dumps, no secrets, no network probes.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$R6SReportPath)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-DockerRead {
    param([string[]]$DockerArguments,[string]$Step)
    $response = & $script:DockerExe @DockerArguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw ('R6U_BLOCKED_DOCKER_' + $Step) }
    return ($response | Out-String).Trim()
}
function Has-Label {
    param($Labels,[string]$Key)
    return ($null -ne $Labels -and $null -ne $Labels.PSObject.Properties[$Key])
}
function Label-Text {
    param($Labels,[string]$Key)
    if (-not (Has-Label -Labels $Labels -Key $Key)) { return '' }
    $value = $Labels.PSObject.Properties[$Key].Value
    if ($value -isnot [string] -or $value.Length -gt 2048) {
        throw 'R6U_BLOCKED_LABEL_TYPE_OR_SIZE'
    }
    return $value
}
$expectedReportHash = '91913CF2DF18099390BD4334CB657ABFAB9EFDD4D35F40DB258E6BF4DDB16DCF'
if (-not (Test-Path -LiteralPath $R6SReportPath -PathType Leaf)) {
    throw 'R6U_BLOCKED_R6S_REPORT_MISSING'
}
$reportFile = Get-Item -LiteralPath $R6SReportPath
if ($reportFile.Length -lt 500 -or $reportFile.Length -gt 65536) {
    throw 'R6U_BLOCKED_R6S_REPORT_SIZE'
}
$reportHash = (Get-FileHash -LiteralPath $R6SReportPath -Algorithm SHA256).Hash
if ($reportHash -ne $expectedReportHash) { throw 'R6U_BLOCKED_R6S_REPORT_HASH' }
try {
    $prior = ConvertFrom-Json -InputObject (Get-Content -LiteralPath $R6SReportPath -Raw -Encoding UTF8) -ErrorAction Stop
} catch { throw 'R6U_BLOCKED_R6S_REPORT_JSON' }
if ($prior.gate -ne 'R24-03W-R6S' -or $prior.vector_exited_both -ne $true -or
    $prior.unencrypted_vector_docker_host_detected -ne $true) {
    throw 'R6U_BLOCKED_R6S_REPORT_BASELINE'
}
$envHost = [Environment]::GetEnvironmentVariable('DOCKER_HOST','Process')
if (-not [string]::IsNullOrWhiteSpace($envHost) -and
    $envHost -notmatch '^npipe:////\./pipe/(docker_engine|dockerDesktopLinuxEngine)$') {
    throw 'R6U_BLOCKED_DOCKER_HOST_NOT_LOCAL_NPIPE'
}
$dockerMatches = @(Get-Command -Name 'docker.exe' -CommandType Application -All -ErrorAction Stop |
    Where-Object { $_.Source -is [string] -and
        [System.IO.Path]::GetFileName($_.Source) -ieq 'docker.exe' -and
        (Test-Path -LiteralPath $_.Source -PathType Leaf) } |
    Select-Object -ExpandProperty Source -Unique)
if ($dockerMatches.Count -ne 1) { throw 'R6U_BLOCKED_DOCKER_EXE' }
$script:DockerExe = [string]$dockerMatches[0]
$ctx = Get-DockerRead -DockerArguments @('context','show') -Step 'CONTEXT'
if ($ctx -notmatch '^[A-Za-z0-9_.-]{1,100}$') { throw 'R6U_BLOCKED_CONTEXT_NAME' }
$endpoint = Get-DockerRead -DockerArguments @('context','inspect',$ctx,'--format','{{.Endpoints.docker.Host}}') -Step 'ENDPOINT'
if ($endpoint -notmatch '^npipe:////\./pipe/(docker_engine|dockerDesktopLinuxEngine)$') {
    throw 'R6U_BLOCKED_CONTEXT_NOT_LOCAL_NPIPE'
}
$engineOS = Get-DockerRead -DockerArguments @('info','--format','{{.OSType}}') -Step 'ENGINE_OS'
if ($engineOS -ne 'linux') { throw 'R6U_BLOCKED_ENGINE_NOT_LINUX' }

$targets = @('supabase_vector_rc4-local-hml','supabase_vector_homologacao-v349198')
$records = New-Object 'System.Collections.Generic.List[object]'
$projectValues = New-Object 'System.Collections.Generic.List[string]'
foreach ($name in $targets) {
    $state = Get-DockerRead -DockerArguments @('container','inspect','--format','{{.State.Status}}',$name) -Step 'VECTOR_STATE'
    if ($state -ne 'exited') { throw 'R6U_BLOCKED_VECTOR_NOT_CONTAINED' }
    $raw = Get-DockerRead -DockerArguments @('container','inspect','--format','{{json .Config.Labels}}',$name) -Step 'VECTOR_LABELS'
    if ($raw.Length -lt 2 -or $raw.Length -gt 32768) { throw 'R6U_BLOCKED_LABEL_RESPONSE_SIZE' }
    try { $labels = ConvertFrom-Json -InputObject $raw -ErrorAction Stop }
    catch { throw 'R6U_BLOCKED_LABEL_RESPONSE_JSON' }
    if ($null -eq $labels -or $labels -isnot [pscustomobject]) { throw 'R6U_BLOCKED_LABEL_RESPONSE_SHAPE' }
    $project = Label-Text -Labels $labels -Key 'com.docker.compose.project'
    $projectValues.Add($project)
    $service = Label-Text -Labels $labels -Key 'com.docker.compose.service'
    $record = [ordered]@{
        target=$name
        state='exited'
        compose_project_label=($project.Length -gt 0)
        compose_service_label=($service.Length -gt 0)
        compose_service_is_vector=($service -eq 'vector')
        compose_config_hash_present=(Has-Label -Labels $labels -Key 'com.docker.compose.config-hash')
        compose_version_present=(Has-Label -Labels $labels -Key 'com.docker.compose.version')
        compose_workdir_present=(Has-Label -Labels $labels -Key 'com.docker.compose.project.working_dir')
        compose_config_files_present=(Has-Label -Labels $labels -Key 'com.docker.compose.project.config_files')
        supabase_cli_project_present=(Has-Label -Labels $labels -Key 'com.supabase.cli.project')
        supabase_service_present=(Has-Label -Labels $labels -Key 'com.supabase.service')
        supabase_stack_root_present=(Has-Label -Labels $labels -Key 'com.supabase.stack-root')
        supabase_instance_present=(Has-Label -Labels $labels -Key 'com.supabase.instance')
    }
    $records.Add([pscustomobject]$record)
}

# Never install a CLI, invoke npx, or inspect files/credentials. Optional local version only.
$cliVersion='NOT_IN_PATH'
$cliMatches = @(Get-Command -Name 'supabase.exe' -CommandType Application -All -ErrorAction SilentlyContinue |
    Where-Object { $_.Source -is [string] -and
        [System.IO.Path]::GetFileName($_.Source) -ieq 'supabase.exe' -and
        (Test-Path -LiteralPath $_.Source -PathType Leaf) } |
    Select-Object -ExpandProperty Source -Unique)
if ($cliMatches.Count -gt 1) {
    $cliVersion='MULTIPLE_INSTALLATIONS_NOT_QUERIED'
} elseif ($cliMatches.Count -eq 1) {
    # PowerShell 5.1 can promote a harmless CLI update notice on stderr to
    # NativeCommandError when ErrorActionPreference is Stop. Capture both
    # streams independently; require exit code 0 and a valid stdout version.
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = [string]$cliMatches[0]
    $psi.Arguments = '--version'
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    try {
        if (-not $proc.Start()) { throw 'R6U_BLOCKED_CLI_VERSION_START' }
        $outTask = $proc.StandardOutput.ReadToEndAsync()
        $errTask = $proc.StandardError.ReadToEndAsync()
        if (-not $proc.WaitForExit(15000)) {
            try { $proc.Kill(); $proc.WaitForExit() }
            catch { throw 'R6U_BLOCKED_CLI_VERSION_TIMEOUT_UNCONFIRMED_STOP' }
            throw 'R6U_BLOCKED_CLI_VERSION_TIMEOUT'
        }
        $proc.WaitForExit()
        $candidate = $outTask.GetAwaiter().GetResult().Trim()
        $advisory = $errTask.GetAwaiter().GetResult().Trim()
        if ($proc.ExitCode -ne 0) { throw 'R6U_BLOCKED_CLI_VERSION_EXIT' }
        if ($candidate.Length -gt 128 -or $advisory.Length -gt 4096) {
            throw 'R6U_BLOCKED_CLI_VERSION_OUTPUT_SIZE'
        }
        if ($candidate -match '^(?:supabase\s+)?v?(\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)$') {
            $cliVersion = $Matches[1]
        } else {
            throw 'R6U_BLOCKED_CLI_VERSION_FORMAT'
        }
        if ($advisory.Length -gt 0) {
            $safeLines = @($advisory -split "\r?\n" |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
            foreach ($line in $safeLines) {
                if ($line -notmatch '^A new version of Supabase CLI is available: v\d+\.\d+\.\d+ \(currently installed v\d+\.\d+\.\d+\)$' -and
                    $line -notmatch '^We recommend updating regularly for new features and bug fixes: https://supabase\.com/\S+$') {
                    throw 'R6U_BLOCKED_CLI_VERSION_UNEXPECTED_STDERR'
                }
            }
        }
    } finally {
        $proc.Dispose()
    }
}
$equal = $projectValues[0].Length -gt 0 -and $projectValues[0] -ceq $projectValues[1]
$report = [ordered]@{
    gate='R24-03W-R6U'
    source_baseline_sha256=$expectedReportHash
    read_mode='DOCKER_INSPECT_STATUS_AND_COMPOSE_LABEL_KEYS_ONLY'
    results=@($records.ToArray())
    same_compose_project_label=$equal
    installed_supabase_cli_version=$cliVersion
    ownership='INFERRED_NOT_PROVEN'
    unix_socket='NOT_PROVEN'
    mtls='NOT_PROVEN'
    chosen_option='C_KEEP_VECTOR_CONTAINED'
    protected_health='LAST_OBSERVED_IN_R6S_NOT_RECHECKED'
    hml='NO_GO'
    production='NO_GO'
}
$downloads = Join-Path $env:USERPROFILE 'Downloads'
if (-not (Test-Path -LiteralPath $downloads -PathType Container)) {
    throw 'R6U_BLOCKED_DOWNLOADS'
}
$destination = Join-Path $downloads ('EXATA_R6U_ORIGIN_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '_' + [guid]::NewGuid().ToString('N').Substring(0,8))
if (Test-Path -LiteralPath $destination) { throw 'R6U_BLOCKED_DIR_EXISTS' }
New-Item -ItemType Directory -Path $destination | Out-Null
$reportPath = Join-Path $destination 'R24_03W_R6U_ORIGIN_RESULT.json'
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $reportPath -Encoding UTF8
$reportSha = (Get-FileHash -LiteralPath $reportPath -Algorithm SHA256).Hash
Write-Host 'EXATA R6U - ETIQUETAS E VERSAO CLI READ-ONLY: PASS' -ForegroundColor Green
foreach ($item in $records) {
    Write-Host ('VECTOR=' + $item.target +
      ' COMPOSE_PROJECT=' + $item.compose_project_label +
      ' COMPOSE_SERVICE_VECTOR=' + $item.compose_service_is_vector +
      ' CONFIG_HASH=' + $item.compose_config_hash_present +
      ' COMPOSE_VERSION=' + $item.compose_version_present +
      ' COMPOSE_WORKDIR=' + $item.compose_workdir_present +
      ' COMPOSE_CONFIG_FILES=' + $item.compose_config_files_present +
      ' SUPABASE_CLI_PROJECT=' + $item.supabase_cli_project_present +
      ' SUPABASE_SERVICE=' + $item.supabase_service_present +
      ' SUPABASE_STACK_ROOT=' + $item.supabase_stack_root_present +
      ' SUPABASE_INSTANCE=' + $item.supabase_instance_present)
}
Write-Host ('COMPOSE_PROJECT_SAME=' + $equal)
Write-Host ('SUPABASE_CLI_VERSION_LOCAL=' + $cliVersion)
Write-Host 'OWNERSHIP=INFERRED_NOT_PROVEN; KEEP_VECTOR_CONTAINED'
Write-Host ('REPORT=' + $reportPath)
Write-Host ('SHA256=' + $reportSha)
Write-Host 'DOCKER_MUTATIONS / SQL / GITHUB_ACTIONS / HML / PRODUCAO: NOT_EXECUTED'
