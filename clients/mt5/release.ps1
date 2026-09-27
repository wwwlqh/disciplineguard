# Compiles the EA for the next Windows app release and puts it where the release workflow takes it from.
# Usage (on a PC with MetaTrader 5): clients/mt5/release.ps1 [-MetaEditor <path to MetaEditor64.exe>]
# Then commit clients/mt5/release/DisciplineGuard.ex5 and run the "Windows app" workflow with "release" ticked.
param([string]$MetaEditor = "C:\Program Files\MetaTrader 5\MetaEditor64.exe")
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot "DisciplineGuard.mq5"
$log = Join-Path $env:TEMP "dg-compile.log"
& $MetaEditor /compile:"$src" /log:"$log" | Out-Null
$text = Get-Content -Encoding Unicode $log -Raw
if ($text -notmatch 'Result: 0 errors') { Write-Output $text; exit 1 }
New-Item -ItemType Directory -Force (Join-Path $PSScriptRoot "release") | Out-Null
Copy-Item (Join-Path $PSScriptRoot "DisciplineGuard.ex5") (Join-Path $PSScriptRoot "release\DisciplineGuard.ex5") -Force
Write-Output "OK clients/mt5/release/DisciplineGuard.ex5"
