# SecureVault - Lambda Deployment Package Script
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = Split-Path -Parent $PSScriptRoot
$zipPath = Join-Path $projectRoot "SecureVaultBackend.zip"
$indexPath = Join-Path $projectRoot "index.mjs"

if (-not (Test-Path $zipPath)) {
    Write-Error "SecureVaultBackend.zip not found at $zipPath"
    exit 1
}

Write-Host "Updating index.mjs inside $zipPath..."
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Update)
$existing = $zip.GetEntry("index.mjs")
if ($existing) {
    $existing.Delete()
}
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $indexPath, "index.mjs")
$zip.Dispose()
Write-Host "SecureVaultBackend.zip updated successfully with latest index.mjs."
