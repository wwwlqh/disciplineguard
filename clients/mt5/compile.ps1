# Compiles DisciplineGuard.ex5 with MetaEditor in a throwaway portable MetaTrader 5, with no clicks.
# Used by the "Windows app" workflow; also works on any Windows PC (your own terminals are never touched).
# Usage: clients/mt5/compile.ps1 [-Work <scratch folder>]
param([string]$Work = "$env:TEMP\dg-mt5-build")
$ErrorActionPreference = 'Stop'
$install = "C:\Program Files\MetaTrader 5"
if (-not (Test-Path "$install\MetaEditor64.exe")) {
  $setup = "$env:TEMP\mt5setup.exe"
  Invoke-WebRequest "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe" -OutFile $setup
  Start-Process $setup -ArgumentList '/auto'
  $t = 0
  while (-not (Test-Path "$install\MetaEditor64.exe") -and $t -lt 900) { Start-Sleep 5; $t += 5 }
  Start-Sleep 10
  Get-Process terminal64, mt5setup -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path "$install\MetaEditor64.exe")) { throw "MetaTrader 5 didn't install" }
}
# A portable copy unpacks the standard library (Trade, Canvas) into its own MQL5 folder on first start.
if (-not (Test-Path "$Work\MQL5\Include\Trade\Trade.mqh")) {
  New-Item -ItemType Directory -Force $Work | Out-Null
  Copy-Item "$install\*" $Work -Recurse -Force
  $p = Start-Process "$Work\terminal64.exe" -ArgumentList '/portable' -PassThru
  $t = 0
  while (-not (Test-Path "$Work\MQL5\Include\Trade\Trade.mqh") -and $t -lt 300) { Start-Sleep 3; $t += 3 }
  Start-Sleep 5
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  Get-Process terminal64 -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$Work*" } | Stop-Process -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path "$Work\MQL5\Include\Trade\Trade.mqh")) { throw "The portable terminal didn't unpack MQL5" }
}
$dst = "$Work\MQL5\Experts\DisciplineGuard"
Remove-Item -Recurse -Force $dst -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item "$PSScriptRoot\DisciplineGuard.mq5" $dst
Copy-Item "$PSScriptRoot\DG" $dst -Recurse
# The EA reports the release version, the one in clients/windows/Cargo.toml.
$version = (Select-String -Path "$PSScriptRoot\..\windows\Cargo.toml" -Pattern '^version = "(.+)"').Matches[0].Groups[1].Value
$config = "$dst\DG\Config.mqh"
(Get-Content $config) -replace '#define DG_VERSION\s+"[^"]*"', "#define DG_VERSION  `"$version`"" | Set-Content -Encoding ascii $config
$log = "$Work\compile.log"
Remove-Item $log -ErrorAction SilentlyContinue
Start-Process "$Work\MetaEditor64.exe" -ArgumentList '/portable', "/compile:`"$dst\DisciplineGuard.mq5`"", "/log:`"$log`"" -Wait
$text = Get-Content -Encoding Unicode $log -Raw
Write-Output $text
if ($text -notmatch 'Result: 0 errors') { throw "The EA didn't compile" }
Copy-Item "$dst\DisciplineGuard.ex5" "$PSScriptRoot\DisciplineGuard.ex5" -Force
Write-Output "OK clients/mt5/DisciplineGuard.ex5"
