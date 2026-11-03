# Starts or stops the Kafka Lab app in the background, with no console window.
# Usually run through "Start Kafka Lab.vbs" / "Stop Kafka Lab.vbs" in the project folder.
#   kafka-lab.ps1 start   start the app, show a tray icon and open it in a Chrome app window.
#                         Closing the window keeps the app running; click the tray icon to bring
#                         the window back (or open a new one), and Quit in its menu stops the app.
#   kafka-lab.ps1 stop    stop the app and the tray, also while it is still starting
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

Add-Type -Namespace KafkaLab -Name Win -MemberDefinition @'
public delegate bool EnumProc(System.IntPtr h, System.IntPtr l);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, System.IntPtr l);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr h);
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int cmd);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
'@

function Find-Chrome {
    @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
      "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
      "$env:LocalAppData\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
}

# A Kafka Lab window: a Chrome app window (its title is just the page title) showing one of our pages.
$script:titles = '^(Kafka|Learn Kafka|.+ . Learn Kafka|Kafka Visualization|127\.0\.0\.1:8888.*)$'
function Find-LabWindow {
    $chromePids = @(Get-Process chrome -ErrorAction SilentlyContinue | ForEach-Object { [uint32] $_.Id })
    if (-not $chromePids) { return [IntPtr]::Zero }
    $script:found = [IntPtr]::Zero
    $cb = [KafkaLab.Win+EnumProc] {
        param($h, $l)
        if (-not [KafkaLab.Win]::IsWindowVisible($h)) { return $true }
        $sb = New-Object System.Text.StringBuilder 512
        [KafkaLab.Win]::GetWindowText($h, $sb, 512) | Out-Null
        $owner = [uint32] 0; [KafkaLab.Win]::GetWindowThreadProcessId($h, [ref] $owner) | Out-Null
        if ($chromePids -contains $owner -and $sb.ToString() -match $script:titles) { $script:found = $h; return $false }
        $true
    }
    [KafkaLab.Win]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
    $script:found
}

# Open a page in a new Kafka Lab window.
function Open-Window([string] $path = '/') {
    $url = "$base$path"
    $chrome = Find-Chrome
    if ($chrome) { Start-Process $chrome "--app=$url" } else { Start-Process $url }   # no Chrome: default browser
}

# Bring the existing Kafka Lab window to the front, or open one.
function Show-Lab {
    $h = Find-LabWindow
    if ($h -eq [IntPtr]::Zero) { Open-Window '/'; return }
    if ([KafkaLab.Win]::IsIconic($h)) { [KafkaLab.Win]::ShowWindow($h, 9) | Out-Null }   # 9 = restore
    [KafkaLab.Win]::SetForegroundWindow($h) | Out-Null
}

# Windows 11 hides new tray icons behind the ^ arrow; ask it to show this one on the taskbar.
# (The setting is per program, and the program is PowerShell.)
function Show-OnTaskbar {
    Get-ChildItem 'HKCU:\Control Panel\NotifyIconSettings' -ErrorAction SilentlyContinue | ForEach-Object {
        $p = Get-ItemProperty $_.PSPath
        if ($p.ExecutablePath -like '*\WindowsPowerShell\v1.0\powershell.exe' -and $p.InitialTooltip -like 'Kafka Lab*' -and $p.IsPromoted -ne 1) {
            Set-ItemProperty $_.PSPath IsPromoted 1 -Type DWord
        }
    }
}

function Get-Launchers {
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
        Where-Object { $_.CommandLine -match 'kafka-lab\.ps1"?\s+start' -and $_.ProcessId -ne $PID }
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
    $launchers = @(Get-Launchers)
    if ((Test-Up) -or $launchers) {
        Stop-App
        # a launcher still starting: stop it with its Maven build (/T takes the whole process tree)
        foreach ($l in $launchers) { & taskkill.exe /T /F /PID $l.ProcessId 2>$null | Out-Null }
        $msg = 'Kafka Lab stopped.'
    } else { $msg = 'Kafka Lab is not running.' }
    [System.Windows.Forms.MessageBox]::Show($msg, 'Kafka Lab') | Out-Null
    exit
}

# Only one tray icon: if a launcher is already running, just open a tab.
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\KafkaLabTray', [ref] $created)
if (-not $created) {
    $until = (Get-Date).AddMinutes(3)
    while (-not (Test-Up) -and (Get-Date) -lt $until) { Start-Sleep -Milliseconds 500 }
    if (Test-Up) { Show-Lab }
    exit
}

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
Show-OnTaskbar
$tray.ShowBalloonTip(4000, 'Kafka Lab', 'Starting... Click this icon to open Kafka Lab; right-click to quit.', 'Info')

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

$open.Add_Click({ Show-Lab })
$learn.Add_Click({ Open-Window '/learn.html' })
$viz.Add_Click({ Open-Window '/visualizer.html' })
$logItem.Add_Click({ if (Test-Path $log) { Start-Process notepad.exe $log } })
# left click: bring the Kafka Lab window back (or open one); right click shows the menu
$tray.Add_MouseClick({ param($s, $e) if ($e.Button -eq 'Left' -and $script:up) { Show-Lab } })
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
        Show-Lab
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
