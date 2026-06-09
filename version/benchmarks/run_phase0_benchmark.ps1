param(
    [string]$WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\RetryDownloadFailures-src")).Path,
    [string]$ProfilePath = (Join-Path $PSScriptRoot "benchmark_profile_v1.0.0.118_national_full.json"),
    [string]$ManifestPath = (Join-Path $PSScriptRoot "area_manifest_v1.0.0.118_national_full.json")
)

$ErrorActionPreference = "Stop"
$runId = Get-Date -Format "yyyyMMdd_HHmmss"
$runFolder = Join-Path $PSScriptRoot (Join-Path "runs" $runId)
New-Item -Path $runFolder -ItemType Directory -Force | Out-Null

$pythonVersion = "python-not-found"
try {
    $pythonVersion = (& python --version 2>&1 | Out-String).Trim()
} catch {
    $pythonVersion = "python-not-found"
}

$metadata = [ordered]@{
    runId = $runId
    startedUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    workspaceRoot = $WorkspaceRoot
    profilePath = $ProfilePath
    manifestPath = $ManifestPath
    pythonVersion = $pythonVersion
    notes = "Manual benchmark execution required. Use this run folder for evidence and summaries."
}

$metadata | ConvertTo-Json -Depth 6 | Out-File (Join-Path $runFolder "run_metadata.json") -Encoding utf8

Write-Host "Created benchmark run folder: $runFolder"
Write-Host "Next steps:"
Write-Host "1. Launch SSURGO Portal from the same workspace/runtime."
Write-Host "2. Execute full-manifest download based on area_manifest_v1.0.0.118_national_full.json."
Write-Host "3. Keep run active until terminal accounting is complete."
Write-Host "4. Collect log output and summarize in Baseline-Report-v1.0.0.117.md."
Write-Host "5. Repeat for each machine and runtime path in the profile validation matrix."
