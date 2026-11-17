# EXATA R24-03W R6T: verify and summarize EXISTING R6S JSON only.
# No docker, network, Supabase CLI, filesystem mutation, GitHub Actions or privileged commands.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$ReportPath
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$expectedSha256 = '91913CF2DF18099390BD4334CB657ABFAB9EFDD4D35F40DB258E6BF4DDB16DCF'
$targetNames = @('supabase_vector_rc4-local-hml','supabase_vector_homologacao-v349198')
$categories = @('db','analytics','studio','storage')

if (-not (Test-Path -LiteralPath $ReportPath -PathType Leaf)) {
    throw 'R6T_BLOCKED_REPORT_MISSING'
}
$actualHash = (Get-FileHash -LiteralPath $ReportPath -Algorithm SHA256).Hash
if ($actualHash -ne $expectedSha256) {
    throw 'R6T_BLOCKED_REPORT_SHA256_CHANGED'
}
$info = Get-Item -LiteralPath $ReportPath
if ($info.Length -lt 500 -or $info.Length -gt 65536) {
    throw 'R6T_BLOCKED_REPORT_SIZE'
}
try {
    $json = Get-Content -LiteralPath $ReportPath -Raw -Encoding UTF8
    $data = ConvertFrom-Json -InputObject $json -ErrorAction Stop
} catch {
    throw 'R6T_BLOCKED_REPORT_JSON'
}
if ($data.gate -ne 'R24-03W-R6S' -or
    $data.evidence_mode -ne 'READ_ONLY_NO_DOCKER_MUTATIONS' -or
    $data.vector_exited_both -ne $true -or
    $data.unencrypted_vector_docker_host_detected -ne $true -or
    $data.unix_socket_option_A -ne 'NOT_PROVEN' -or
    $data.mtls_option_B -ne 'NOT_PROVEN' -or
    $data.recommended_option_C -ne 'KEEP_CONTAINMENT_UNTIL_APPROVAL') {
    throw 'R6T_BLOCKED_REPORT_SCHEMA_OR_BASELINE'
}
$vectors = @($data.vectors | Where-Object { $null -ne $_ })
if ($vectors.Count -ne 2) { throw 'R6T_BLOCKED_VECTOR_COUNT' }
foreach ($name in $targetNames) {
    $matches = @($vectors | Where-Object { $_.name -eq $name })
    if ($matches.Count -ne 1 -or $matches[0].present -ne $true -or
        $matches[0].state -ne 'exited' -or
        $matches[0].docker_host -ne 'HTTP_2375_UNSAFE' -or
        $matches[0].unix_socket_mount -ne $false) {
        throw 'R6T_BLOCKED_VECTOR_BASELINE'
    }
}
$groups = @($data.protected_categories_observed | Where-Object { $null -ne $_ })
if ($groups.Count -ne 4) { throw 'R6T_BLOCKED_PROTECTED_GROUP_COUNT' }
foreach ($cat in $categories) {
    $matches = @($groups | Where-Object { $_.category -eq $cat })
    if ($matches.Count -ne 1 -or $matches[0].observed -ne 2 -or
        $matches[0].running -ne 2 -or $matches[0].healthy -ne 2) {
        throw 'R6T_BLOCKED_PROTECTED_GROUP_BASELINE'
    }
}
Write-Host 'EXATA R6T - RELATORIO R6S INTEGRO: PASS' -ForegroundColor Green
Write-Host 'R6R_NODE_OFFLINE=271/271 PASS (EVIDENCIA ANTERIOR)'
Write-Host 'R6S_REPORT_SHA256=PASS'
Write-Host 'VECTOR_EXITED=2/2'
Write-Host 'PROTECTED_HEALTHY=8/8'
foreach ($v in $vectors) {
    foreach ($key in @('compose_label','compose_config_files_label','tls_verify_present',
                       'tls_cert_path_present','network','mount_count','restart_count')) {
        if ($null -eq $v.PSObject.Properties[$key]) { throw 'R6T_BLOCKED_FIELD_MISSING' }
    }
    $networkClass = [string]$v.network
    if ($networkClass -notin @('none','bridge','host','CUSTOM_OR_UNVERIFIED')) {
        throw 'R6T_BLOCKED_NETWORK_CLASS'
    }
    $mountCount = [int]$v.mount_count
    $restarts = [int]$v.restart_count
    if ($mountCount -lt 0 -or $mountCount -gt 1000 -or
        $restarts -lt 0 -or $restarts -gt 100000000) {
        throw 'R6T_BLOCKED_COUNTER_RANGE'
    }
    Write-Host ('VECTOR=' + $v.name +
      ' COMPOSE_LABEL=' + [bool]$v.compose_label +
      ' COMPOSE_CONFIG_FILES_LABEL=' + [bool]$v.compose_config_files_label +
      ' TLS_VERIFY_ENV_PRESENT=' + [bool]$v.tls_verify_present +
      ' TLS_CERT_PATH_ENV_PRESENT=' + [bool]$v.tls_cert_path_present +
      ' NETWORK_CLASS=' + $networkClass +
      ' MOUNTS=' + $mountCount +
      ' RESTART_COUNT=' + $restarts)
}
Write-Host 'SOURCE_OWNERSHIP=NOT_YET_PROVEN'
Write-Host 'A_UNIX=NOT_PROVEN; B_MTLS=NOT_PROVEN; C_KEEP_CONTAINMENT'
Write-Host 'DOCKER / NETWORK / SQL / HML / PRODUCTION: NOT_TOUCHED'
