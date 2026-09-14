$ErrorActionPreference = 'Stop'
$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:WORK_CALENDAR_HOST = '127.0.0.1'
$env:WORK_CALENDAR_PORT = '4173'
$env:WORK_CALENDAR_DB = Join-Path $AppDir 'data\work-calendar.sqlite3'
$env:WORK_CALENDAR_ORIGINS = if ($env:WORK_CALENDAR_ORIGINS) { $env:WORK_CALENDAR_ORIGINS } else { 'https://your-domain.example' }
$env:WORK_CALENDAR_SECURE_COOKIE = if ($env:WORK_CALENDAR_SECURE_COOKIE) { $env:WORK_CALENDAR_SECURE_COOKIE } else { '1' }
$env:PYTHONUNBUFFERED = '1'

Set-Location $AppDir
& python (Join-Path $AppDir 'server.py') --host 127.0.0.1 --port 4173
exit $LASTEXITCODE
