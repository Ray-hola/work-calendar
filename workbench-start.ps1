<#
  workbench-start.ps1 - Work Calendar 一键启动入口。

  依次确保：本地服务（127.0.0.1:4173）在跑、Cloudflare Tunnel 在跑、
  健康检查通过，然后打开浏览器。已运行的部分不会重复启动。

  用法（双击 workbench-start.cmd 等价于无参数运行）：
    .\workbench-start.ps1                 # 启动并打开本机地址
    .\workbench-start.ps1 -Public         # 打开固定域名
    .\workbench-start.ps1 -NoBrowser      # 只启动，不开浏览器
    .\workbench-start.ps1 -NoTunnel       # 不动 Tunnel
    .\workbench-start.ps1 -Port 4174      # 换个端口
#>
[CmdletBinding()]
param(
  [int]$Port = 4173,
  [string]$BindHost = '127.0.0.1',
  [int]$TimeoutSeconds = 20,
  [switch]$NoBrowser,
  [switch]$NoTunnel,
  [switch]$Public
)
$ErrorActionPreference = 'Stop'
$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $AppDir

function Write-Step([string]$Message) { Write-Host "==> $Message" }

function Test-Listening([int]$PortNumber) {
  try {
    return [bool](Get-NetTCPConnection -LocalPort $PortNumber -State Listen -ErrorAction Stop)
  } catch {
    return [bool](netstat -ano | Select-String ":$PortNumber\s+\S+\s+LISTENING")
  }
}

function Resolve-Python {
  $candidates = New-Object System.Collections.ArrayList
  if ($env:WORK_CALENDAR_PYTHON) { [void]$candidates.Add(@($env:WORK_CALENDAR_PYTHON)) }
  $localDefault = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
  if (Test-Path -LiteralPath $localDefault) { [void]$candidates.Add(@($localDefault)) }
  $launcher = Get-Command py -ErrorAction SilentlyContinue
  if ($launcher) { [void]$candidates.Add(@($launcher.Source, '-3')) }
  foreach ($name in @('python3', 'python')) {
    $found = Get-Command $name -ErrorAction SilentlyContinue
    if ($found) { [void]$candidates.Add(@($found.Source)) }
  }
  $roots = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Python'),
    $env:ProgramFiles,
    ${env:ProgramFiles(x86)}
  )
  foreach ($root in $roots) {
    if (-not $root -or -not (Test-Path -LiteralPath $root)) { continue }
    Get-ChildItem -LiteralPath $root -Directory -Filter 'Python3*' -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending | ForEach-Object {
        $exe = Join-Path $_.FullName 'python.exe'
        if (Test-Path -LiteralPath $exe) { [void]$candidates.Add(@($exe)) }
      }
  }
  foreach ($candidate in $candidates) {
    $exe = $candidate[0]
    $pre = @()
    if ($candidate.Count -gt 1) { $pre = @($candidate[1..($candidate.Count - 1)]) }
    try {
      $probe = & $exe @pre -c "import sys;print('%d.%d' % sys.version_info[:2])" 2>$null
      if ($LASTEXITCODE -eq 0 -and $probe) {
        return @{ exe = $exe; pre = $pre; version = ([string]$probe).Trim() }
      }
    } catch { }
  }
  return $null
}

function Get-CloudflaredPath {
  $found = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($found) { return $found.Source }
  foreach ($path in @(
      (Join-Path $env:ProgramFiles 'cloudflared\cloudflared.exe'),
      (Join-Path ${env:ProgramFiles(x86)} 'cloudflared\cloudflared.exe')
    )) {
    if ($path -and (Test-Path -LiteralPath $path)) { return $path }
  }
  return $null
}

function Ensure-Tunnel {
  if (Get-Process cloudflared -ErrorAction SilentlyContinue) { return '已在运行' }
  foreach ($taskName in @('Cloudflare Tunnel', 'Work Calendar Cloudflare Tunnel')) {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
      Start-ScheduledTask -TaskName $taskName
      Start-Sleep -Seconds 3
      return "已通过计划任务「$taskName」启动"
    }
  }
  $exe = Get-CloudflaredPath
  if (-not $exe) { return '未找到 cloudflared，跳过' }
  $config = Join-Path $env:USERPROFILE '.cloudflared\config.yml'
  if (-not (Test-Path -LiteralPath $config)) { return "未找到 $config，跳过" }
  $match = Select-String -LiteralPath $config -Pattern '^tunnel:\s*(\S+)' | Select-Object -First 1
  if (-not $match) { return 'Tunnel 配置缺少 tunnel 名称，跳过' }
  $tunnel = $match.Matches[0].Groups[1].Value
  Start-Process -FilePath $exe -ArgumentList @('tunnel', '--config', "`"$config`"", 'run', $tunnel) -WindowStyle Hidden
  Start-Sleep -Seconds 3
  return "已启动 cloudflared（$tunnel）"
}

function Wait-Health([string]$Url, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { return $true }
    } catch { }
    Start-Sleep -Milliseconds 750
  }
  return $false
}

function Get-TunnelDomain {
  $config = Join-Path $env:USERPROFILE '.cloudflared\config.yml'
  if (-not (Test-Path -LiteralPath $config)) { return $null }
  $match = Select-String -LiteralPath $config -Pattern '^\s*-\s*hostname:\s*(\S+)' | Select-Object -First 1
  if ($match) { return 'https://' + $match.Matches[0].Groups[1].Value }
  return $null
}

$localUrl = "http://127.0.0.1:$Port/"
$healthUrl = "http://${BindHost}:$Port/api/health"
$dataDir = Join-Path $AppDir 'data'
if (-not (Test-Path -LiteralPath $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }

if (Test-Listening $Port) {
  Write-Step "服务已在端口 $Port 运行"
} else {
  $python = Resolve-Python
  if (-not $python) {
    throw '未找到可用的 Python。请安装 Python 3.11+，或设置环境变量 WORK_CALENDAR_PYTHON 指向 python.exe。'
  }
  Write-Step "Python $($python.version) · $($python.exe)"
  if ([version]$python.version -lt [version]'3.11') { Write-Warning "Python $($python.version) 低于建议的 3.11。" }

  $override = Join-Path $AppDir 'run-windows.local.ps1'
  if (Test-Path -LiteralPath $override) { . $override }

  $outLog = Join-Path $dataDir 'workbench-start.log'
  $errLog = Join-Path $dataDir 'workbench-start.err.log'
  $serverArgs = @()
  if ($python.pre) { $serverArgs += $python.pre }
  $serverArgs += @('server.py', '--host', $BindHost, '--port', "$Port")
  Write-Step "启动 server.py（输出：$outLog）"
  Start-Process -FilePath $python.exe -ArgumentList $serverArgs -WorkingDirectory $AppDir `
    -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog
  if (-not (Wait-Health $healthUrl $TimeoutSeconds)) {
    throw "服务在 $TimeoutSeconds 秒内未通过健康检查，请查看 $errLog"
  }
  Write-Step '健康检查通过'
}

$tunnelState = '已跳过'
if (-not $NoTunnel) {
  Write-Step '检查 Cloudflare Tunnel'
  $tunnelState = Ensure-Tunnel
  Write-Step "Tunnel：$tunnelState"
}

$domain = Get-TunnelDomain
Write-Host ''
Write-Host 'Work Calendar 就绪'
Write-Host "  本机：$localUrl"
if ($domain) { Write-Host "  公网：$domain" }
if ($tunnelState -like '未找到*') { Write-Host '  提示：Tunnel 未启动，公网地址暂时不可用。' }

if (-not $NoBrowser) {
  $target = $localUrl
  if ($Public -and $domain) { $target = $domain }
  Write-Step "打开 $target"
  Start-Process $target
}
