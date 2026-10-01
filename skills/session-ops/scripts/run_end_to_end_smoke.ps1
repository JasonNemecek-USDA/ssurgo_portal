param(
    [string]$RepoRoot,
    [string]$SampleRoot,
    [string]$SampleSubfolder = 'WI055',
    [string]$DatabaseParent = 'tmp/agent/e2e',
    [int]$IndexedPretestFolderCount = 1205,
    [int]$IndexedPretestMaxMs = 20000,
    [switch]$StartRuntimeIfNeeded = $true,
    [switch]$OpenBrowser = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-NormalizedPath([string]$PathValue){
    return (Resolve-Path -Path $PathValue).Path
}

function Convert-PathToApi([string]$PathValue){
    return ($PathValue -replace '\\', '/')
}

function Invoke-JsonPost([string]$Uri, [hashtable]$Payload){
    $body = $Payload | ConvertTo-Json -Depth 10 -Compress
    return Invoke-RestMethod -Method Post -Uri $Uri -ContentType 'application/json' -Body $body
}

function New-IndexedPretestSubfolders([int]$Count){
    if($Count -lt 1){
        throw 'Indexed pretest folder count must be at least 1.'
    }

    $list = New-Object System.Collections.Generic.List[string]
    for($i = 1; $i -le $Count; $i++){
        $list.Add(('WI{0:D3}_AUTOTEST' -f $i))
    }

    return ,$list.ToArray()
}

function Wait-Endpoint([string]$Uri, [int]$TimeoutSeconds = 90){
    $start = Get-Date
    while(((Get-Date) - $start).TotalSeconds -lt $TimeoutSeconds){
        try{
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 3
            if($response.StatusCode -eq 200){
                return $true
            }
        }
        catch{
            Start-Sleep -Milliseconds 500
        }
    }

    return $false
}

if([string]::IsNullOrWhiteSpace($RepoRoot)){
    $RepoRoot = Join-Path $PSScriptRoot '..\..\..'
}
$RepoRoot = Get-NormalizedPath $RepoRoot
Set-Location $RepoRoot

if([string]::IsNullOrWhiteSpace($SampleRoot)){
    $SampleRoot = Join-Path $RepoRoot 'version\error_check_wi055'
}
$SampleRoot = Get-NormalizedPath $SampleRoot

$dbParentPath = Join-Path $RepoRoot $DatabaseParent
if(-not (Test-Path $dbParentPath)){
    New-Item -ItemType Directory -Path $dbParentPath -Force | Out-Null
}
$dbParentPath = Get-NormalizedPath $dbParentPath

$startupUri = 'http://localhost:8083/startUp'
$statusUri = 'http://localhost:8083/serverStatus'
$apiUri = 'http://localhost:8083/SSURGOPortalUI'

if($StartRuntimeIfNeeded){
    $runtimeReady = Wait-Endpoint -Uri $startupUri -TimeoutSeconds 3
    if(-not $runtimeReady){
        Write-Output 'Runtime not detected. Launching visible runtime...'
        $startupScriptPath = Join-Path $RepoRoot 'start_ssurgo_visible.cmd'
        Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $startupScriptPath) -WorkingDirectory $RepoRoot | Out-Null
        if($OpenBrowser){
            Start-Process 'http://localhost:8083/SSURGOPortalUI' | Out-Null
        }
    }
}

if(-not (Wait-Endpoint -Uri $startupUri -TimeoutSeconds 120)){
    throw 'startUp endpoint did not become healthy in time.'
}
if(-not (Wait-Endpoint -Uri $statusUri -TimeoutSeconds 30)){
    throw 'serverStatus endpoint did not become healthy in time.'
}

$runStamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$dbName = "SSURGO_E2E_$runStamp"

$copyTemplateResponse = Invoke-JsonPost -Uri $apiUri -Payload @{
    request = 'copytemplatefile'
    templatename = 'GeoPackage'
    folder = Convert-PathToApi $dbParentPath
    filename = $dbName
    overwrite = $true
}
if(-not $copyTemplateResponse.status){
    throw "copytemplatefile failed: $($copyTemplateResponse.errormessage)"
}

$dbPathFs = Join-Path $dbParentPath ($dbName + '.gpkg')
if(-not (Test-Path $dbPathFs)){
    throw "copytemplatefile did not create expected database file: $dbPathFs"
}
$dbPath = Convert-PathToApi (Get-NormalizedPath $dbPathFs)

$pretestStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$pretestResponse = Invoke-JsonPost -Uri $apiUri -Payload @{
    request = 'pretestimportcandidates'
    database = $dbPath
    root = Convert-PathToApi $SampleRoot
    istabularonly = $true
    quickpretest = $true
    subfolders = @($SampleSubfolder)
}
$pretestStopwatch.Stop()

if(-not $pretestResponse.status){
    throw "pretestimportcandidates failed: $($pretestResponse.errormessage)"
}

$pretestRow = @($pretestResponse.subfolders) | Where-Object { $_.childfoldername -eq $SampleSubfolder } | Select-Object -First 1
if($null -eq $pretestRow){
    throw "pretestimportcandidates did not return subfolder row for $SampleSubfolder"
}
if(-not $pretestRow.preteststatus){
    throw "pretestimportcandidates returned failure for ${SampleSubfolder}: $($pretestRow.errormessage)"
}

$indexedSubfolders = New-IndexedPretestSubfolders -Count $IndexedPretestFolderCount
$indexedPretestStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$indexedPretestResponse = Invoke-JsonPost -Uri $apiUri -Payload @{
    request = 'pretestimportcandidates'
    database = $dbPath
    root = Convert-PathToApi $SampleRoot
    istabularonly = $true
    quickpretest = $true
    subfolders = $indexedSubfolders
}
$indexedPretestStopwatch.Stop()

if(-not $indexedPretestResponse.status){
    throw "indexed pretestimportcandidates failed: $($indexedPretestResponse.errormessage)"
}
if($indexedPretestResponse.quickpretestmode -ne 'indexed'){
    throw "indexed pretest expected quickpretestmode=indexed but got '$($indexedPretestResponse.quickpretestmode)'"
}

$indexedRows = @($indexedPretestResponse.subfolders)
if($indexedRows.Count -ne $IndexedPretestFolderCount){
    throw "indexed pretest returned $($indexedRows.Count) rows; expected $IndexedPretestFolderCount"
}

$failedIndexedRows = @($indexedRows | Where-Object { -not $_.preteststatus })
if($failedIndexedRows.Count -gt 0){
    throw "indexed pretest reported $($failedIndexedRows.Count) failed folders"
}

if($indexedPretestStopwatch.ElapsedMilliseconds -gt $IndexedPretestMaxMs){
    throw "indexed pretest exceeded threshold: $($indexedPretestStopwatch.ElapsedMilliseconds) ms > $IndexedPretestMaxMs ms"
}

$importStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$importResponse = Invoke-JsonPost -Uri $apiUri -Payload @{
    request = 'importcandidates'
    database = $dbPath
    root = Convert-PathToApi $SampleRoot
    skippretest = $true
    istabularonly = $true
    loadinspatialorder = $false
    loadspatialdatawithinsubprocess = $false
    dissolvemupolygon = $false
    includeinterpretationsubrules = $false
    subfolders = @($SampleSubfolder)
}
$importStopwatch.Stop()

if(-not $importResponse.status){
    throw "importcandidates failed: $($importResponse.errormessage)"
}

$importRow = @($importResponse.subfolders) | Where-Object { $_.childfoldername -eq $SampleSubfolder } | Select-Object -First 1
if($null -eq $importRow){
    throw "importcandidates did not return subfolder row for $SampleSubfolder"
}
if(-not [string]::IsNullOrWhiteSpace([string]$importRow.errormessage)){
    throw "importcandidates returned error for ${SampleSubfolder}: $($importRow.errormessage)"
}

$logPath = Join-Path $RepoRoot 'version\main_RunMode.SSURGO_PORTAL_UI_log.log'
if(-not (Test-Path $logPath)){
    throw "Expected runtime log file not found: $logPath"
}

$lastStartupLine = (Select-String -Path $logPath -Pattern 'RuntimeStartupMetadata' | Select-Object -Last 1).LineNumber
if($lastStartupLine -gt 0){
    $postStartupLogs = Get-Content $logPath | Select-Object -Skip ($lastStartupLine - 1)
    $errorLogs = $postStartupLogs | Select-String -Pattern ' -- ERROR -- | -- CRITICAL -- '
    if($errorLogs){
        throw "Runtime log contains ERROR/CRITICAL entries after startup."
    }

    $knownRegressionPatterns = @(
        'Request Entity Too Large',
        ' 413 ',
        'database is locked',
        'transporterror'
    )
    foreach($pattern in $knownRegressionPatterns){
        if($postStartupLogs | Select-String -SimpleMatch -Pattern $pattern){
            throw "Runtime log contains regression pattern: $pattern"
        }
    }

    $successfulPretests = @($postStartupLogs | Select-String -SimpleMatch -Pattern 'Request pretestimportcandidates was successful')
    if($successfulPretests.Count -lt 1){
        throw "Expected at least 1 successful pretestimportcandidates log entry, found $($successfulPretests.Count)"
    }
}

Write-Output "E2E_SMOKE_OK"
Write-Output ("DATABASE={0}" -f $dbPath)
Write-Output ("PRETEST_MS={0}" -f $pretestStopwatch.ElapsedMilliseconds)
Write-Output ("INDEXED_PRETEST_COUNT={0}" -f $IndexedPretestFolderCount)
Write-Output ("INDEXED_PRETEST_MS={0}" -f $indexedPretestStopwatch.ElapsedMilliseconds)
Write-Output ("IMPORT_MS={0}" -f $importStopwatch.ElapsedMilliseconds)
Write-Output ("LOG={0}" -f $logPath)
