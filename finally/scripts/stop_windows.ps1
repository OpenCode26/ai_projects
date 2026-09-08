<#
.SYNOPSIS
    Stop and remove the FinAlly container. The db/ bind mount is left alone, so
    the portfolio persists. Safe to run repeatedly.
.EXAMPLE
    .\scripts\stop_windows.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$ContainerName = 'finally'

$Engine = if (Get-Command docker -ErrorAction SilentlyContinue) { 'docker' }
          elseif (Get-Command podman -ErrorAction SilentlyContinue) { 'podman' }
          else { $null }

if (-not $Engine) {
    Write-Error "Neither 'docker' nor 'podman' was found on PATH."
}

& $Engine container inspect $ContainerName *> $null
if ($LASTEXITCODE -eq 0) {
    & $Engine rm -f $ContainerName *> $null
    Write-Host "Stopped and removed container '$ContainerName'. Your data in db\ is untouched."
} else {
    Write-Host "No container named '$ContainerName' is running. Nothing to do."
}
