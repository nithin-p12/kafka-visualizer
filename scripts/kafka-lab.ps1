# Starts or stops the Kafka Lab app in the background, with no console window.
# Usually run through "Start Kafka Lab.vbs" / "Stop Kafka Lab.vbs" in the project folder.
#   kafka-lab.ps1 start   start the app (if not already running) and open it in Chrome
#   kafka-lab.ps1 stop    stop the app
param([ValidateSet('start', 'stop')] [string] $Action = 'start')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$port = 8888
$url  = "http://127.0.0.1:$port/"
$log  = Join-Path $root 'target\kafka-lab.log'

Add-Type -AssemblyName System.Windows.Forms

function Test-Up {
    $client = New-Object System.Net.Sockets.TcpClient
    try { $client.ConnectAsync('127.0.0.1', $port).Wait(300) -and $client.Connected } catch { $false } finally { $client.Dispose() }
}

function Open-Browser {
    $chrome = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($chrome) { Start-Process $chrome $url } else { Start-Process $url }   # no Chrome: default browser
}

if ($Action -eq 'stop') {
    $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    if (-not $pids) {
        [System.Windows.Forms.MessageBox]::Show('Kafka Lab is not running.', 'Kafka Lab') | Out-Null
        exit
    }
    $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    [System.Windows.Forms.MessageBox]::Show('Kafka Lab stopped.', 'Kafka Lab') | Out-Null
    exit
}

# start: already running -> just open the page
if (Test-Up) { Open-Browser; exit }

New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
# spring-boot:run compiles first, so the page always shows the latest code.
Start-Process cmd.exe -ArgumentList '/c', "call .\mvnw.cmd spring-boot:run > target\kafka-lab.log 2>&1" `
    -WorkingDirectory $root -WindowStyle Hidden

# Wait up to 3 minutes for the server (the first run downloads Maven dependencies).
$deadline = (Get-Date).AddMinutes(3)
while ((Get-Date) -lt $deadline) {
    if (Test-Up) { Open-Browser; exit }
    Start-Sleep -Milliseconds 700
}
[System.Windows.Forms.MessageBox]::Show("Kafka Lab did not start within 3 minutes.`nSee the log: $log", 'Kafka Lab',
    'OK', 'Error') | Out-Null
