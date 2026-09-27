# Runs a compiled test EA in an isolated portable MT5 copy and waits for its output file.
# Usage: run-portable.ps1 -Ex5 <path.ex5> -Output <file in MQL5\Files> [-Inputs file1,file2] [-Portable <dir>] [-TimeoutSec 120]
# The portable copy has its own data folder, so the trader's own terminals and accounts are never touched.
param(
  [Parameter(Mandatory = $true)][string]$Ex5,
  [Parameter(Mandatory = $true)][string]$Output,
  [string[]]$Inputs = @(),
  [string]$Portable = "$env:TEMP\dg-mt5-portable",
  [int]$TimeoutSec = 120
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path "$Portable\terminal64.exe")) {
  New-Item -ItemType Directory -Force "$Portable" | Out-Null
  Copy-Item "C:\Program Files\MetaTrader 5\terminal64.exe" "$Portable\"
  Copy-Item -Recurse "C:\Program Files\MetaTrader 5\Config" "$Portable\" -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force "$Portable\MQL5\Experts", "$Portable\MQL5\Files" | Out-Null
$name = [IO.Path]::GetFileNameWithoutExtension($Ex5)
Copy-Item $Ex5 "$Portable\MQL5\Experts\" -Force
foreach ($f in $Inputs) { Copy-Item $f "$Portable\MQL5\Files\" -Force }
$out = "$Portable\MQL5\Files\$Output"
Remove-Item $out -ErrorAction SilentlyContinue
"[StartUp]`r`nExpert=$name`r`nSymbol=EURUSD`r`nPeriod=H1`r`n" | Out-File -Encoding unicode "$Portable\run.ini"
$p = Start-Process -FilePath "$Portable\terminal64.exe" -ArgumentList "/portable", "/config:`"$Portable\run.ini`"" -PassThru
$t = 0
while (-not (Test-Path $out) -and $t -lt $TimeoutSec) { Start-Sleep -Seconds 2; $t += 2 }
Start-Sleep -Seconds 2
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
if (Test-Path $out) { Write-Output "OK $out" } else { Write-Output "TIMEOUT after $t s"; exit 1 }
