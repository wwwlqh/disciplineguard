# Runs the shared rule cases (packages/core/test/cases.ts) through the EA's MQL5 engine in the isolated portable MT5
# copy, then diffs the results against the TypeScript engine (compare.ts). No trades: the test EA only evaluates.
# Usage: clients/mt5/tests/core-tests.ps1
param(
  [string]$Portable = "$env:TEMP\dg-mt5-portable",
  [string]$Work = "$env:TEMP\dg-mt5-build"
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path "$PSScriptRoot\..\..\..").Path

# Compile next to the EA, so the test includes the same DG folder.
& "$PSScriptRoot\..\compile.ps1" -Work $Work | Out-Null
$dst = "$Work\MQL5\Experts\DisciplineGuard\tests"
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item "$PSScriptRoot\DG_CoreTests.mq5" $dst -Force
$log = "$Work\compile-core-tests.log"
Remove-Item $log -ErrorAction SilentlyContinue
Start-Process "$Work\MetaEditor64.exe" -ArgumentList '/portable', "/compile:`"$dst\DG_CoreTests.mq5`"", "/log:`"$log`"" -Wait
$text = Get-Content -Encoding Unicode $log -Raw
if ($text -notmatch 'Result: 0 errors') { Write-Output $text; throw "DG_CoreTests didn't compile" }

$cases = "$env:TEMP\dg_cases.json"
node "$repo\packages\core\test\export-cases.ts" $cases
if ($LASTEXITCODE -ne 0) { throw "Couldn't export the cases" }
& "$PSScriptRoot\run-portable.ps1" -Ex5 "$dst\DG_CoreTests.ex5" -Output dg_results.json -Inputs $cases -Portable $Portable
if ($LASTEXITCODE -ne 0) { throw 'DG_CoreTests did not write its results' }
node "$PSScriptRoot\compare.ts" "$Portable\MQL5\Files\dg_results.json"
exit $LASTEXITCODE
