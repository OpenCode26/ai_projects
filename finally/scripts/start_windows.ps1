<#
.SYNOPSIS
    Build (if needed) and run the FinAlly container. Safe to run repeatedly.
.EXAMPLE
    .\scripts\start_windows.ps1
    .\scripts\start_windows.ps1 -Build -NoOpen
#>
[CmdletBinding()]
param(
    [switch]$Build,
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

$ImageName = 'finally'
$ContainerName = 'finally'
$Port = if ($env:FINALLY_PORT) { $env:FINALLY_PORT } else { '8000' }

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

$Engine = if (Get-Command docker -ErrorAction SilentlyContinue) { 'docker' }
          elseif (Get-Command podman -ErrorAction SilentlyContinue) { 'podman' }
          else { $null }

if (-not $Engine) {
    Write-Error "Neither 'docker' nor 'podman' was found on PATH. Install Docker Desktop (https://docs.docker.com/get-docker/) and try again."
}

if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    Write-Host 'No .env found - created one from .env.example.'
    Write-Host 'Edit .env and set OPENROUTER_API_KEY before using the AI chat panel.'
}

New-Item -ItemType Directory -Force -Path 'db' | Out-Null

& $Engine image inspect $ImageName *> $null
$imageExists = ($LASTEXITCODE -eq 0)
if ($Build -or -not $imageExists) {
    Write-Host "Building image '$ImageName' with $Engine..."
    & $Engine build -t $ImageName .
    if ($LASTEXITCODE -ne 0) { Write-Error 'Image build failed.' }
}

& $Engine container inspect $ContainerName *> $null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Removing existing container '$ContainerName'..."
    & $Engine rm -f $ContainerName *> $null
}

$DbMount = "$($RootDir -replace '\\', '/')/db:/app/db"
& $Engine run -d `
    --name $ContainerName `
    -p "$($Port):8000" `
    -v $DbMount `
    --env-file .env `
    --restart unless-stopped `
    $ImageName *> $null
if ($LASTEXITCODE -ne 0) { Write-Error 'Failed to start the container.' }

$Url = "http://localhost:$Port"
# Probed over 127.0.0.1 rather than localhost: published ports bind IPv4 only,
# but localhost resolves to ::1 first on many hosts, which fails the probe even
# though the app is up.
$HealthUrl = "http://127.0.0.1:$Port/api/health"
Write-Host -NoNewline 'Waiting for FinAlly to come up'
foreach ($i in 1..60) {
    try {
        $resp = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 3
        if ($resp.StatusCode -eq 200) {
            Write-Host ''
            Write-Host "FinAlly is running at $Url"
            if (-not $NoOpen) { Start-Process $Url }
            Write-Host 'Stop it with: .\scripts\stop_windows.ps1'
            exit 0
        }
    } catch {
        $running = (& $Engine container inspect -f '{{.State.Running}}' $ContainerName 2>$null)
        if ($running -ne 'true') {
            Write-Host ''
            Write-Host 'Container exited during startup. Logs:'
            & $Engine logs $ContainerName
            exit 1
        }
    }
    Write-Host -NoNewline '.'
    Start-Sleep -Seconds 1
}

Write-Host ''
Write-Host "Timed out waiting for $HealthUrl. Recent logs:"
& $Engine logs --tail 50 $ContainerName
exit 1
