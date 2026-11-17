# EXATA R24-03W R6X — local OCI tag/digest reconciliation only.
# Never starts/stops containers, pulls images, reads logs/env/entrypoint or changes Docker.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$R6WReportPath)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest

function Invoke-DockerRead {
    param([string[]]$DockerArgs,[string]$Step)
    $result = & $script:DockerExe @DockerArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw ('R6X_BLOCKED_DOCKER_' + $Step) }
    return ($result | Out-String).Trim()
}
function Read-StringList {
    param([string]$Raw,[string]$Step)
    if ($Raw.Length -gt 16384) { throw ('R6X_BLOCKED_' + $Step + '_SIZE') }
    if ($Raw -eq 'null') { return ,@() }
    try {
        $parsed = ConvertFrom-Json -InputObject $Raw -ErrorAction Stop
    } catch { throw ('R6X_BLOCKED_' + $Step + '_JSON') }
    $items = @($parsed)
    if ($items.Count -gt 64) { throw ('R6X_BLOCKED_' + $Step + '_COUNT') }
    foreach ($item in $items) {
        if ($item -isnot [string] -or $item.Length -lt 1 -or $item.Length -gt 512) {
            throw ('R6X_BLOCKED_' + $Step + '_ITEM')
        }
    }
    return ,$items
}

$expectedReportHash='3B6ECD3BDB08F3F1F798D7D5148DE4A9EB8CF8421BE63A3AF5F3DAFBA13838D9'
$expectedImageId='sha256:ca92d617e905953c3f852e7e88061f7039460e733522e3f0c21bc6ae946b2558'
$expectedIndexDigest='ca92d617e905953c3f852e7e88061f7039460e733522e3f0c21bc6ae946b2558'
$names=@('supabase_vector_rc4-local-hml','supabase_vector_homologacao-v349198')
$sourceRoots='(?:(?:docker\.io/)?timberio/vector|(?:docker\.io/)?supabase/vector|ghcr\.io/supabase/(?:cli/)?vector|public\.ecr\.aws/supabase/vector)'
$tagPattern='^' + $sourceRoots + ':(?<ver>v?[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9._-]+)?)$'
$digestPattern='^' + $sourceRoots + '@sha256:(?<digest>[a-f0-9]{64})$'

if (-not (Test-Path -LiteralPath $R6WReportPath -PathType Leaf)) {
    throw 'R6X_BLOCKED_R6W_REPORT_MISSING'
}
$reportSize=(Get-Item -LiteralPath $R6WReportPath).Length
if ($reportSize -lt 600 -or $reportSize -gt 65536) {
    throw 'R6X_BLOCKED_R6W_REPORT_SIZE'
}
$reportHash=(Get-FileHash -LiteralPath $R6WReportPath -Algorithm SHA256).Hash
if ($reportHash -ne $expectedReportHash) { throw 'R6X_BLOCKED_R6W_SHA256' }
try {
    $prior=ConvertFrom-Json -InputObject (Get-Content -LiteralPath $R6WReportPath -Raw -Encoding UTF8) -ErrorAction Stop
} catch { throw 'R6X_BLOCKED_R6W_REPORT_JSON' }
if ($prior.gate -ne 'R24-03W-R6W' -or $prior.vector_count -ne 2 -or
    $prior.protected_health_current -ne '8_OF_8_RUNNING_HEALTHY' -or
    $prior.option -ne 'C_KEEP_CONTAINMENT' -or
    $prior.lab_coverage -ne 'LAB_VERSION_MISMATCH_OR_UNVERIFIED' -or
    $prior.docker_changes -ne $false) {
    throw 'R6X_BLOCKED_R6W_BASELINE'
}
$vectors=@($prior.vectors | Where-Object { $null -ne $_ })
if ($vectors.Count -ne 2) { throw 'R6X_BLOCKED_R6W_VECTOR_COUNT' }
foreach($name in $names) {
    $one=@($vectors | Where-Object { $_.target -eq $name })
    if ($one.Count -ne 1 -or $one[0].state -ne 'exited' -or
        $one[0].image_config_sha256 -ne $expectedImageId) {
        throw 'R6X_BLOCKED_R6W_VECTOR_SCOPE'
    }
}

$envHost=[Environment]::GetEnvironmentVariable('DOCKER_HOST','Process')
if (-not [string]::IsNullOrWhiteSpace($envHost) -and
    $envHost -notmatch '^npipe:////\./pipe/(docker_engine|dockerDesktopLinuxEngine)$') {
    throw 'R6X_BLOCKED_DOCKER_HOST_NOT_LOCAL'
}
$executables=@(Get-Command -Name 'docker.exe' -CommandType Application -All -ErrorAction Stop |
    Where-Object { $_.Source -is [string] -and
        [System.IO.Path]::GetFileName($_.Source) -ieq 'docker.exe' -and
        (Test-Path -LiteralPath $_.Source -PathType Leaf) } |
    Select-Object -ExpandProperty Source -Unique)
if ($executables.Count -ne 1) { throw 'R6X_BLOCKED_DOCKER_EXE' }
$script:DockerExe=[string]$executables[0]

$ctx=Invoke-DockerRead -DockerArgs @('context','show') -Step 'CONTEXT'
if ($ctx -notmatch '^[a-zA-Z0-9_.-]{1,100}$') { throw 'R6X_BLOCKED_CONTEXT_NAME' }
$endpoint=Invoke-DockerRead -DockerArgs @('context','inspect',$ctx,'--format','{{.Endpoints.docker.Host}}') -Step 'ENDPOINT'
if ($endpoint -notmatch '^npipe:////\./pipe/(docker_engine|dockerDesktopLinuxEngine)$') {
    throw 'R6X_BLOCKED_CONTEXT_ENDPOINT'
}
$engine=Invoke-DockerRead -DockerArgs @('info','--format','{{.OSType}}') -Step 'ENGINE'
if ($engine -ne 'linux') { throw 'R6X_BLOCKED_ENGINE_OS' }
foreach($name in $names) {
    $state=Invoke-DockerRead -DockerArgs @('container','inspect','--format','{{.State.Status}}',$name) -Step 'STATE'
    if ($state -ne 'exited') { throw 'R6X_BLOCKED_VECTOR_STATE_CHANGED' }
    $id=Invoke-DockerRead -DockerArgs @('container','inspect','--format','{{.Image}}',$name) -Step 'IMAGE_ID'
    if ($id -cne $expectedImageId) { throw 'R6X_BLOCKED_VECTOR_IMAGE_CHANGED' }
}
$localId=Invoke-DockerRead -DockerArgs @('image','inspect','--format','{{.Id}}',$expectedImageId) -Step 'IMAGE_ID_LOCAL'
if ($localId -cne $expectedImageId) { throw 'R6X_BLOCKED_LOCAL_IMAGE_CHANGED' }
$os=Invoke-DockerRead -DockerArgs @('image','inspect','--format','{{.Os}}',$expectedImageId) -Step 'IMAGE_OS'
if ($os -ne 'linux') { throw 'R6X_BLOCKED_IMAGE_OS' }
$arch=Invoke-DockerRead -DockerArgs @('image','inspect','--format','{{.Architecture}}',$expectedImageId) -Step 'IMAGE_ARCH'
if ($arch -notin @('amd64','arm64','arm','386')) { throw 'R6X_BLOCKED_IMAGE_ARCH' }
$rawTags=Invoke-DockerRead -DockerArgs @('image','inspect','--format','{{json .RepoTags}}',$expectedImageId) -Step 'IMAGE_TAGS'
$rawDigests=Invoke-DockerRead -DockerArgs @('image','inspect','--format','{{json .RepoDigests}}',$expectedImageId) -Step 'IMAGE_DIGESTS'
$tags=@(Read-StringList -Raw $rawTags -Step 'TAGS')
$digests=@(Read-StringList -Raw $rawDigests -Step 'DIGESTS')

$versions=New-Object 'System.Collections.Generic.List[string]'
foreach($tag in $tags) {
    if ($tag -match $tagPattern) {
        $versions.Add($Matches['ver'])
    }
}
$unique=@($versions | Select-Object -Unique)
if ($unique.Count -gt 1) { throw 'R6X_BLOCKED_CONFLICTING_PUBLIC_VERSION_TAGS' }
$version=if ($unique.Count -eq 1) { [string]$unique[0] } else { 'UNVERIFIED' }
$knownDigestFound=$false
foreach($digest in $digests) {
    if ($digest -match $digestPattern) {
        if ($Matches['digest'] -ceq $expectedIndexDigest) { $knownDigestFound=$true }
    }
}
$version53=($version -match '^v?0\.53\.0(?:-alpine)?$')
$coverage=if ($version53 -and $knownDigestFound) {
    'TAG_AND_PUBLIC_INDEX_DIGEST_MATCH_NOT_BINARY_PROOF'
} elseif ($version53) {
    'TAG_MATCH_DIGEST_NOT_PROVEN'
} else {
    'VERSION_UNVERIFIED_OR_DIFFERENT'
}
$output=[ordered]@{
    gate='R24-03W-R6X'
    executed_at=(Get-Date).ToString('o')
    read_only=$true
    r6w_sha256=$expectedReportHash
    image_config_id=$expectedImageId
    image_os=$os
    image_architecture=$arch
    recognized_public_version_tag=$version
    recognized_public_index_digest_match=$knownDigestFound
    lab_reference='Vector v0.53.0'
    lab_coverage=$coverage
    raw_repository_names='WITHHELD'
    vector_container_states='2_OF_2_EXITED'
    protected_health='R6W_LAST_OBSERVATION_NOT_RECHECKED'
    vector_binary_executed=$false
    docker_mutation=$false
    option='C_KEEP_CONTAINMENT'
    hml='NO_GO'
    production='NO_GO'
}
$downloads=Join-Path $env:USERPROFILE 'Downloads'
if (-not (Test-Path -LiteralPath $downloads -PathType Container)) { throw 'R6X_BLOCKED_DOWNLOADS' }
$folder=Join-Path $downloads ('EXATA_R6X_OCI_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '_' + [guid]::NewGuid().ToString('N').Substring(0,8))
if (Test-Path -LiteralPath $folder) { throw 'R6X_BLOCKED_OUTPUT_EXISTS' }
New-Item -ItemType Directory -Path $folder | Out-Null
$report=Join-Path $folder 'R24_03W_R6X_RESULT.json'
$output | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $report -Encoding UTF8
$sha=(Get-FileHash -LiteralPath $report -Algorithm SHA256).Hash
Write-Host 'EXATA R6X - METADADOS OCI READ-ONLY: PASS' -ForegroundColor Green
Write-Host ('VECTOR_IMAGE_CONFIG_ID=' + $expectedImageId)
Write-Host ('LOCAL_IMAGE_PLATFORM=' + $os + '/' + $arch)
Write-Host ('PUBLIC_VERSION_TAG=' + $version)
Write-Host ('PUBLIC_INDEX_DIGEST_MATCH=' + $knownDigestFound)
Write-Host ('LAB_COVERAGE=' + $coverage)
Write-Host ('REPORT=' + $report)
Write-Host ('SHA256=' + $sha)
Write-Host 'VECTOR=2/2 EXITED; KEEP_CONTAINMENT'
Write-Host 'DOCKER_MUTATIONS / PULL / EXEC / LOGS / SQL / HML / PRODUCTION: NOT_RUN'
