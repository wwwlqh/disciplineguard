# Runs DG_CloseTests.mq5 ("Close outside trades", SPEC §9.2) in the Strategy Tester of the isolated portable MT5 copy.
# The tester simulates every trade on this PC: nothing reaches a broker, and the trader's own terminals are never touched.
# Usage: clients/mt5/tests/close-tests.ps1 [-From 2026.09.01] [-To 2026.09.02]
param(
  [string]$Portable = "$env:TEMP\dg-mt5-portable",
  [string]$Work = "$env:TEMP\dg-mt5-build",
  [string]$From = '2026.09.01',
  [string]$To = '2026.09.02'
)
$ErrorActionPreference = 'Stop'

# Compile next to the EA, so the test includes the same DG folder.
& "$PSScriptRoot\..\compile.ps1" -Work $Work | Out-Null
$dst = "$Work\MQL5\Experts\DisciplineGuard\tests"
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item "$PSScriptRoot\DG_CloseTests.mq5" $dst -Force
$log = "$Work\compile-tests.log"
Remove-Item $log -ErrorAction SilentlyContinue
Start-Process "$Work\MetaEditor64.exe" -ArgumentList '/portable', "/compile:`"$dst\DG_CloseTests.mq5`"", "/log:`"$log`"" -Wait
$text = Get-Content -Encoding Unicode $log -Raw
if ($text -notmatch 'Result: 0 errors') { Write-Output $text; throw "DG_CloseTests didn't compile" }

if (-not (Test-Path "$Portable\terminal64.exe")) { throw "No portable MT5 at $Portable (tests/run-portable.ps1 makes one)" }
Get-Process terminal64 -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq "$Portable\terminal64.exe" } | Stop-Process -Force
New-Item -ItemType Directory -Force "$Portable\MQL5\Experts" | Out-Null
Copy-Item "$dst\DG_CloseTests.ex5" "$Portable\MQL5\Experts\" -Force
# The tester needs the account this copy last signed in with (its saved demo account) for symbols and history.
$auth = Get-ChildItem "$Portable\logs\*.log" | Sort-Object LastWriteTime -Descending | ForEach-Object { Get-Content -Encoding Unicode $_.FullName } |
  Select-String "'(\d+)': authorized on (\S+) " | Select-Object -First 1
if (-not $auth) { throw "This MT5 copy has never signed in to an account. Open it once ($Portable\terminal64.exe /portable) and sign in to a demo account." }
$login = $auth.Matches[0].Groups[1].Value
$server = $auth.Matches[0].Groups[2].Value
"[Common]`r`nLogin=$login`r`nServer=$server`r`n[Tester]`r`nExpert=DG_CloseTests`r`nSymbol=EURUSD`r`nPeriod=M1`r`nModel=1`r`nOptimization=0`r`nFromDate=$From`r`nToDate=$To`r`nDeposit=10000`r`nCurrency=USD`r`nLeverage=100`r`nVisual=0`r`nShutdownTerminal=1`r`n" |
  Out-File -Encoding unicode "$Portable\close-tests.ini"
# The tester appends to one log a day: start from empty logs, so only this run's lines count.
Get-ChildItem "$Portable\Tester" -Recurse -Filter *.log -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
$start = Get-Date
$p = Start-Process "$Portable\terminal64.exe" -ArgumentList '/portable', "/config:`"$Portable\close-tests.ini`"" -PassThru
if (-not $p.WaitForExit(600000)) { $p | Stop-Process -Force; throw 'The tester did not finish in 10 minutes' }

# The EA prints to the tester agent's log.
$lines = Get-ChildItem "$Portable\Tester" -Recurse -Filter *.log -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -ge $start } |
  ForEach-Object { Get-Content -Encoding Unicode $_.FullName } |
  Where-Object { $_ -match 'DGTEST' } |
  ForEach-Object { ($_ -split 'DGTEST ', 2)[1] } |
  Select-Object -Unique
if (-not $lines) { throw 'No DGTEST lines: the test did not run' }
$lines | ForEach-Object { Write-Output $_ }
if ($lines -match '^FAIL' -or -not ($lines -match '^done .* passed$')) { exit 1 }
