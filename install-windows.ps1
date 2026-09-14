param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'WorkCalendar'),
  [switch]$SkipPythonInstall
)
$ErrorActionPreference = 'Stop'

function Find-Python {
  $cmd = Get-Command py -ErrorAction SilentlyContinue
  if ($cmd) { return @{ exe = $cmd.Source; args = '-3' } }
  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd) { return @{ exe = $cmd.Source; args = '' } }
  return $null
}

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($sourceDir -ne $InstallDir) {
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  Copy-Item -Path (Join-Path $sourceDir '*') -Destination $InstallDir -Recurse -Force
}

$python = Find-Python
if (-not $python -and -not $SkipPythonInstall) {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) { throw '未找到 Python。请安装 Python 3.11+ 后重新运行，或在支持 winget 的 Windows 10/11 上运行此脚本。' }
  & $winget.Source install --id Python.Python.3.12 --exact --scope user --accept-package-agreements --accept-source-agreements
  $python = Find-Python
}
if (-not $python) { throw '未找到 Python 3.11+。' }

$dataDir = Join-Path $InstallDir 'data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$runner = Join-Path $InstallDir 'run-windows.ps1'
$shell = (Get-Command powershell.exe).Source
$action = New-ScheduledTaskAction -Execute $shell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runner`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Work Calendar' -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName 'Work Calendar'

Write-Host "Work Calendar 已安装到 $InstallDir"
Write-Host '已注册并启动开机登录任务：Work Calendar'
Write-Host '本机地址：http://127.0.0.1:4173/'
