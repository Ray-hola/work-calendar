param(
  [string]$AppDir = (Split-Path -Parent $PSScriptRoot),
  [string]$Cloudflared = 'cloudflared.exe'
)
$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw '请以“管理员身份”打开 PowerShell 后重新运行此脚本。'
}

$runner = Join-Path $AppDir 'run-windows.ps1'
if (-not (Test-Path $runner)) { throw "找不到 $runner" }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw '未找到 Python，请先安装 Python 3.11 或更高版本。' }
$cloudflaredCommand = Get-Command $Cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflaredCommand) { throw '未找到 cloudflared.exe，请先安装 Cloudflare Tunnel 客户端。' }
$cloudflaredPath = $cloudflaredCommand.Source

$cfConfig = Join-Path $env:USERPROFILE '.cloudflared\config.yml'
if (-not (Test-Path $cfConfig)) { throw "找不到 $cfConfig，请先复制 Windows Tunnel 配置和 credentials JSON。" }

$shell = (Get-Command powershell.exe).Source
$appAction = New-ScheduledTaskAction -Execute $shell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runner`""
$cfAction = New-ScheduledTaskAction -Execute $cloudflaredPath -Argument "tunnel --config `"$cfConfig`" run work-calendar"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType InteractiveToken -RunLevel Highest

Register-ScheduledTask -TaskName 'Work Calendar' -Action $appAction -Trigger $trigger -Principal $taskPrincipal -Force | Out-Null
Register-ScheduledTask -TaskName 'Work Calendar Cloudflare Tunnel' -Action $cfAction -Trigger $trigger -Principal $taskPrincipal -Force | Out-Null
Write-Host '已注册两个开机登录任务：Work Calendar、Work Calendar Cloudflare Tunnel'
Start-ScheduledTask -TaskName 'Work Calendar'
Start-ScheduledTask -TaskName 'Work Calendar Cloudflare Tunnel'
