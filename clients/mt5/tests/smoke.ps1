# Runs DisciplineGuard.ex5 in the isolated portable MT5 copy and takes screenshots of the terminal window.
# Usage: smoke.ps1 [-Seconds 25] [-Shots 1] [-Keep]
# To connect it, run a debug build of the Windows app against the local server first (clients/windows/README.md).
# The portable copy has its own data folder, so the trader's own terminals and accounts are never touched.
param(
  [int]$Seconds = 25,
  [int]$Shots = 1,
  [int]$Every = 10,
  [string]$OutDir = "$env:TEMP\dg-smoke",
  [string]$Portable = "$env:TEMP\dg-mt5-portable",
  [switch]$Keep,
  [switch]$Fresh
)
$ErrorActionPreference = 'Stop'
$ex5 = Join-Path $PSScriptRoot "..\DisciplineGuard.ex5"
New-Item -ItemType Directory -Force "$Portable\MQL5\Experts", "$Portable\MQL5\Presets", "$Portable\MQL5\Files", $OutDir | Out-Null
Copy-Item $ex5 "$Portable\MQL5\Experts\" -Force
if ($Fresh) { Remove-Item -Recurse -Force "$Portable\MQL5\Files\DisciplineGuard" -ErrorAction SilentlyContinue }
"PanelCorner=1`r`nPanelScale=1.0`r`n" | Out-File -Encoding unicode "$Portable\MQL5\Presets\dg-smoke.set"
"[Experts]`r`nAllowLiveTrading=1`r`nEnabled=1`r`nAccount=0`r`nProfile=0`r`n[StartUp]`r`nExpert=DisciplineGuard`r`nExpertParameters=dg-smoke.set`r`nSymbol=EURUSD`r`nPeriod=H1`r`n" | Out-File -Encoding unicode "$Portable\smoke.ini"

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class DgWin {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$running = Get-Process terminal64 -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq "$Portable\terminal64.exe" }
$running | Stop-Process -Force -ErrorAction SilentlyContinue
if ($running) { Start-Sleep -Seconds 2 }
$p = Start-Process -FilePath "$Portable\terminal64.exe" -ArgumentList "/portable", "/config:`"$Portable\smoke.ini`"" -PassThru
Start-Sleep -Seconds ([Math]::Max(3, $Seconds - ($Shots - 1) * $Every))
for ($i = 1; $i -le $Shots; $i++) {
  $q = Get-Process terminal64 -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq "$Portable\terminal64.exe" -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($q) {
    $h = $q.MainWindowHandle
    [DgWin]::ShowWindow($h, 3) | Out-Null
    Start-Sleep -Milliseconds 600
    $r = New-Object DgWin+RECT
    [DgWin]::GetWindowRect($h, [ref]$r) | Out-Null
    $w = $r.Right - $r.Left; $hh = $r.Bottom - $r.Top
    $bmp = New-Object System.Drawing.Bitmap $w, $hh
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $dc = $g.GetHdc(); [DgWin]::PrintWindow($h, $dc, 2) | Out-Null; $g.ReleaseHdc($dc)
    $file = Join-Path $OutDir "shot$i.png"
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Output "SHOT $file"
  } else { Write-Output "no window yet" }
  if ($i -lt $Shots) { Start-Sleep -Seconds $Every }
}
$all = Get-Process terminal64 -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq "$Portable\terminal64.exe" }
if (-not $Keep) { $all | Stop-Process -Force -ErrorAction SilentlyContinue; Write-Output "stopped" } else { Write-Output "PID $($all.Id)" }
Get-ChildItem "$Portable\MQL5\Logs" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1 | ForEach-Object { Get-Content -Encoding Unicode $_.FullName -Tail 15 }
