# Starts or stops the Kafka Lab app in the background, with no console window.
# Usually run through "Start Kafka Lab.vbs" / "Stop Kafka Lab.vbs" in the project folder.
#   kafka-lab.ps1 start   start the app, show a tray icon (open tabs, quit) and open it in Chrome
#   kafka-lab.ps1 stop    stop the app (the tray icon goes away by itself)
param([ValidateSet('start', 'stop')] [string] $Action = 'start')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$port = 8888
$base = "http://127.0.0.1:$port"
$log  = Join-Path $root 'target\kafka-lab.log'

Add-Type -AssemblyName System.Windows.Forms, System.Drawing

function Test-Up {
    $client = New-Object System.Net.Sockets.TcpClient
    try { $client.ConnectAsync('127.0.0.1', $port).Wait(300) -and $client.Connected } catch { $false } finally { $client.Dispose() }
}

function Open-Browser([string] $path = '/') {
    $url = "$base$path"
    $chrome = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($chrome) { Start-Process $chrome $url } else { Start-Process $url }   # no Chrome: default browser
}

function Stop-App {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}

# The PN brand mark in Kafka Lab purple (same shapes as static/brand-logo.svg) on a white tile, for the tray.
function New-TrayIcon {
    $bmp = New-Object System.Drawing.Bitmap 32, 32
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $tile = New-Object System.Drawing.Drawing2D.GraphicsPath
    $tile.AddArc(0, 0, 12, 12, 180, 90); $tile.AddArc(19, 0, 12, 12, 270, 90)
    $tile.AddArc(19, 19, 12, 12, 0, 90); $tile.AddArc(0, 19, 12, 12, 90, 90); $tile.CloseFigure()
    $g.FillPath([System.Drawing.Brushes]::White, $tile)
    $g.TranslateTransform(4.5, 4.5); $g.ScaleTransform(0.23, 0.23); $g.TranslateTransform(-24, -20)
    $pt = { param($x, $y) New-Object System.Drawing.PointF $x, $y }
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddPolygon([System.Drawing.PointF[]]@((& $pt 26 22), (& $pt 88 22), (& $pt 78.4 58.7), (& $pt 56 33), (& $pt 29 117), (& $pt 26 117)))
    $n = New-Object System.Drawing.Drawing2D.GraphicsPath
    $n.AddBezier((& $pt 104 31), (& $pt 113 40), (& $pt 121 51), (& $pt 121 64))
    $n.AddBezier((& $pt 121 64), (& $pt 121 82), (& $pt 105 97), (& $pt 88 99.5))
    $n.AddLines([System.Drawing.PointF[]]@((& $pt 88 99.5), (& $pt 54 99.5), (& $pt 64.2 67.2), (& $pt 86 92), (& $pt 102.5 32.5)))
    $n.CloseFigure()
    $purple = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(0x7c, 0x3a, 0xed))
    $g.FillPath($purple, $p); $g.FillPath($purple, $n)
    $g.Dispose()
    [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}

if ($Action -eq 'stop') {
    if (Test-Up) { Stop-App; $msg = 'Kafka Lab stopped.' } else { $msg = 'Kafka Lab is not running.' }
    [System.Windows.Forms.MessageBox]::Show($msg, 'Kafka Lab') | Out-Null
    exit
}

# Only one tray icon: if a launcher is already running, just open a tab.
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\KafkaLabTray', [ref] $created)
if (-not $created) { Open-Browser; exit }

$server = $null
if (-not (Test-Up)) {
    New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
    # spring-boot:run compiles first, so the page always shows the latest code.
    $server = Start-Process cmd.exe -ArgumentList '/c', "call .\mvnw.cmd spring-boot:run > target\kafka-lab.log 2>&1" `
        -WorkingDirectory $root -WindowStyle Hidden -PassThru
}

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = New-TrayIcon
$tray.Text = 'Kafka Lab: starting...'
$tray.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$open = $menu.Items.Add('Open Kafka Lab');  $open.Font = New-Object System.Drawing.Font($open.Font, 'Bold')
$learn = $menu.Items.Add('Open Learn')
$viz = $menu.Items.Add('Open Visualizer')
$logItem = $menu.Items.Add('Show log')
$menu.Items.Add('-') | Out-Null
$quit = $menu.Items.Add('Quit (stop the app)')
foreach ($i in $open, $learn, $viz) { $i.Enabled = $false }
$tray.ContextMenuStrip = $menu

$script:up = $false
$script:started = Get-Date
$done = {
    $timer.Stop(); $tray.Visible = $false; $tray.Dispose()
    [System.Windows.Forms.Application]::Exit()
}

$open.Add_Click({ Open-Browser '/' })
$learn.Add_Click({ Open-Browser '/learn.html' })
$viz.Add_Click({ Open-Browser '/visualizer.html' })
$logItem.Add_Click({ if (Test-Path $log) { Start-Process notepad.exe $log } })
$tray.Add_MouseDoubleClick({ if ($script:up) { Open-Browser '/' } })
$quit.Add_Click({
    Stop-App
    if ($server -and -not $server.HasExited) { & taskkill.exe /T /F /PID $server.Id | Out-Null }
    & $done
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1500
$timer.Add_Tick({
    $now = Test-Up
    if ($now -and -not $script:up) {
        $script:up = $true
        $tray.Text = "Kafka Lab: running on port $port"
        foreach ($i in $open, $learn, $viz) { $i.Enabled = $true }
        Open-Browser '/'
    } elseif (-not $now -and $script:up) {
        & $done                                            # stopped elsewhere (Stop Kafka Lab.vbs, crash)
    } elseif (-not $now -and (($server -and $server.HasExited) -or ((Get-Date) - $script:started).TotalMinutes -gt 3)) {
        $timer.Stop()
        [System.Windows.Forms.MessageBox]::Show("Kafka Lab did not start.`nSee the log: $log", 'Kafka Lab', 'OK', 'Error') | Out-Null
        & $done
    }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()
$mutex.ReleaseMutex()
