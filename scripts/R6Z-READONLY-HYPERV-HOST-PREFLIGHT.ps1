# EXATA R24-03W R6Z - Hyper-V host capacity PRE-FLIGHT READ ONLY.
# NO Enable-WindowsOptionalFeature, New-VM, network change, reboot or Docker operations.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest

function GiB {
    param([double]$Bytes)
    if ($Bytes -lt 0) { throw 'R6Z_BLOCKED_NEGATIVE_STORAGE' }
    return [Math]::Round(($Bytes / 1073741824.0),2)
}
function NumberOrFail {
    param($Value,[string]$Name)
    if ($null -eq $Value) { throw ('R6Z_BLOCKED_MISSING_' + $Name) }
    $result=[double]$Value
    if ($result -lt 0) { throw ('R6Z_BLOCKED_NEGATIVE_' + $Name) }
    return $result
}

$os=Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction Stop
$system=Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction Stop
$processors=@(Get-CimInstance -ClassName Win32_Processor -ErrorAction Stop)
$drives=@(Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType=3' -ErrorAction Stop)
if ($null -eq $os -or $null -eq $system -or $processors.Count -lt 1 -or $drives.Count -lt 1) {
    throw 'R6Z_BLOCKED_CIM_INVENTORY'
}
$osName=[string]$os.Caption
$osVersion=[string]$os.Version
$editionAllowed=($osName -match 'Windows (10|11)' -and
    $osName -match '(Pro|Professional|Enterprise|Education)')
$totalGiB=GiB -Bytes (NumberOrFail -Value $system.TotalPhysicalMemory -Name 'TOTAL_MEMORY')
$freeGiB=GiB -Bytes ((NumberOrFail -Value $os.FreePhysicalMemory -Name 'AVAILABLE_MEMORY_KIB')*1024.0)
$logicalProcessors=0
$virtualizationFirmware=$false
foreach($cpu in $processors) {
    $logicalProcessors += [int]$cpu.NumberOfLogicalProcessors
    if ($cpu.VirtualizationFirmwareEnabled -eq $true) { $virtualizationFirmware=$true }
}
$hypervisorPresent=($system.HypervisorPresent -eq $true)
$virtualizationLikelyAvailable=($virtualizationFirmware -or $hypervisorPresent)

$featureState='UNAVAILABLE_OR_UNKNOWN'
$featureCmd=Get-Command Get-WindowsOptionalFeature -ErrorAction SilentlyContinue
if ($null -ne $featureCmd) {
    try {
        $feature=Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -ErrorAction Stop
        if ($null -ne $feature -and $null -ne $feature.State) {
            $featureState=[string]$feature.State
        }
    } catch {
        $featureState='READ_FAILED_NO_CHANGE'
    }
}
$hyperVReady=($featureState -eq 'Enabled')

$driveList=New-Object 'System.Collections.Generic.List[object]'
foreach($drive in $drives) {
    $letter=[string]$drive.DeviceID
    if ($letter -notmatch '^[A-Z]:$') { throw 'R6Z_BLOCKED_DRIVE_FORMAT' }
    $free=GiB -Bytes (NumberOrFail -Value $drive.FreeSpace -Name 'DISK_FREE')
    $capacity=GiB -Bytes (NumberOrFail -Value $drive.Size -Name 'DISK_CAPACITY')
    $driveList.Add([pscustomobject][ordered]@{
        drive=$letter
        capacity_gib=$capacity
        free_gib=$free
        candidate_for_lab=($free -ge 70.0)
    })
}
$suitable=@($driveList.ToArray() | Where-Object { $_.candidate_for_lab })
$existingVMs='NOT_QUERIED_HYPERV_UNAVAILABLE'
$existingSwitches='NOT_QUERIED_HYPERV_UNAVAILABLE'
if ($hyperVReady) {
    $vmCmd=Get-Command Get-VM -ErrorAction SilentlyContinue
    $switchCmd=Get-Command Get-VMSwitch -ErrorAction SilentlyContinue
    if ($null -ne $vmCmd) {
        try { $existingVMs=[string](@(Get-VM -ErrorAction Stop).Count) }
        catch { $existingVMs='READ_FAILED_NO_CHANGE' }
    }
    if ($null -ne $switchCmd) {
        try { $existingSwitches=[string](@(Get-VMSwitch -ErrorAction Stop).Count) }
        catch { $existingSwitches='READ_FAILED_NO_CHANGE' }
    }
}
$natCount='NOT_AVAILABLE'
$natCmd=Get-Command Get-NetNat -ErrorAction SilentlyContinue
if ($null -ne $natCmd) {
    try { $natCount=[string](@(Get-NetNat -ErrorAction Stop).Count) }
    catch { $natCount='READ_FAILED_NO_CHANGE' }
}

$ramEnough=($totalGiB -ge 16.0 -and $freeGiB -ge 6.0)
$cpuEnough=($logicalProcessors -ge 4)
$diskEnough=($suitable.Count -gt 0)
$canConsider=($editionAllowed -and $ramEnough -and $cpuEnough -and
    $diskEnough -and $virtualizationLikelyAvailable -and $hyperVReady)
$recommendation=if ($canConsider) { 'ELIGIBLE_FOR_SEPARATE_APPROVAL_NOT_PROVISIONED' }
    elseif (-not $editionAllowed) { 'BLOCKED_WINDOWS_EDITION' }
    elseif (-not $virtualizationLikelyAvailable) { 'BLOCKED_VIRTUALIZATION_UNAVAILABLE' }
    elseif (-not $hyperVReady) { 'BLOCKED_HYPERV_NOT_ENABLED_OR_UNKNOWN' }
    elseif (-not $ramEnough) { 'BLOCKED_RAM_CAPACITY' }
    elseif (-not $cpuEnough) { 'BLOCKED_CPU_CAPACITY' }
    else { 'BLOCKED_NO_DRIVE_WITH_70_GIB_FREE' }

$report=[ordered]@{
    gate='R24-03W-R6Z'
    time=(Get-Date).ToString('o')
    mode='WINDOWS_HOST_HARDWARE_READ_ONLY'
    os_name=$osName
    os_version=$osVersion
    supported_os_edition=$editionAllowed
    memory_total_gib=$totalGiB
    memory_available_gib=$freeGiB
    logical_processors=$logicalProcessors
    virtualization_firmware_or_hypervisor=$virtualizationLikelyAvailable
    hypervisor_already_present=$hypervisorPresent
    hyperv_feature_state=$featureState
    existing_vm_count=$existingVMs
    existing_vswitch_count=$existingSwitches
    existing_nat_count=$natCount
    drives=@($driveList.ToArray())
    initial_vm_proposal=[ordered]@{
        vcpu=2;ram_gib=4;vhdx_max_gib=32
        min_host_total_memory_gib=16;min_current_free_memory_gib=6
        min_drive_free_before_vm_gib=70
    }
    resource_assessment=$recommendation
    provisioning_authorized=$false
    hyperv_changed=$false
    docker_or_wsl_touched=$false
    vm_created=$false
    hml='NO_GO'
    production='NO_GO'
}
$downloads=Join-Path $env:USERPROFILE 'Downloads'
if (-not (Test-Path -LiteralPath $downloads -PathType Container)) {
    throw 'R6Z_BLOCKED_DOWNLOADS_MISSING'
}
$dest=Join-Path $downloads ('EXATA_R6Z_HYPERV_PREFLIGHT_' +
    (Get-Date -Format 'yyyyMMdd_HHmmss') + '_' +
    [guid]::NewGuid().ToString('N').Substring(0,8))
if (Test-Path -LiteralPath $dest) { throw 'R6Z_BLOCKED_DEST_EXISTS' }
New-Item -ItemType Directory -Path $dest | Out-Null
$reportPath=Join-Path $dest 'R24_03W_R6Z_PREFLIGHT.json'
$report | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $reportPath -Encoding UTF8
$sha=(Get-FileHash -LiteralPath $reportPath -Algorithm SHA256).Hash
Write-Host 'EXATA R6Z - DIAGNOSTICO READ-ONLY: PASS' -ForegroundColor Green
Write-Host ('WINDOWS_EDITION=' + $osName)
Write-Host ('RAM_TOTAL_GIB=' + $totalGiB + ' RAM_FREE_GIB=' + $freeGiB)
Write-Host ('LOGICAL_CPUS=' + $logicalProcessors + ' VIRTUALIZATION=' + $virtualizationLikelyAvailable)
Write-Host ('HYPERV_FEATURE=' + $featureState)
foreach($disk in $driveList) {
    Write-Host ('DRIVE=' + $disk.drive + ' FREE_GIB=' + $disk.free_gib +
        ' LAB_CANDIDATE_70_GIB=' + $disk.candidate_for_lab)
}
Write-Host ('EXISTING_VM_COUNT=' + $existingVMs + ' VSWITCH_COUNT=' + $existingSwitches +
    ' NAT_COUNT=' + $natCount)
Write-Host ('VM_RESOURCE_ASSESSMENT=' + $recommendation)
Write-Host ('REPORT=' + $reportPath)
Write-Host ('SHA256=' + $sha)
Write-Host 'NO_HYPERV_ENABLE / NO_REBOOT / NO_VM_CREATE / NO_DOCKER / NO_HML / NO_PRODUCTION'
