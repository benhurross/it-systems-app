<#
  AP Plus IT: workstation check message at Windows sign-in.

  Runs as the signed-in user (no admin rights). At each sign-in it tells the IT app this PC's name,
  serial number and MAC (so Asset Discovery can match it to its asset, even when renamed), and asks
  whether IT has a workstation check result this person has not read yet; if so it shows it in a
  window, and "I've read it" tells the app. Nothing is installed or kept on the PC. If the app does
  not answer within a few seconds, it quietly does nothing.

  Set up: see docs/WORKSTATION-CHECKS.md. Fill in the two values below first.
#>

# --- Settings -----------------------------------------------------------------------------------
# The app's address, as staff open it in their browser.
$AppUrl = "http://192.168.0.119:3200"
# A key made in the app under Settings > API access, with "Used for: Workstation messages".
# It can only fetch and acknowledge these messages; it reaches nothing else in the app.
$ApiKey = "apit_PASTE_THE_KEY_HERE"
# Seconds to wait after sign-in, so the desktop has loaded first.
$WaitSeconds = 20
# ------------------------------------------------------------------------------------------------

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2

# Who signed in: the account's UPN (name@applus.com.sa), its short name, and the computer, with
# the PC's serial number (from its BIOS) and the MAC of the network card it uses.
function Get-SignIn {
    $upn = ""
    try { $upn = (& whoami.exe /upn 2>$null | Out-String).Trim() } catch { $upn = "" }
    if ($upn -notmatch "@") { $upn = "" }
    $serial = ""
    try { $serial = [string](Get-CimInstance -ClassName Win32_BIOS -ErrorAction Stop).SerialNumber } catch { $serial = "" }
    $mac = ""
    try {
        # The card with a default gateway is the one on the office network.
        $nic = Get-CimInstance -ClassName Win32_NetworkAdapterConfiguration -Filter "IPEnabled = TRUE" -ErrorAction Stop |
            Where-Object { $_.DefaultIPGateway } | Select-Object -First 1
        if ($nic) { $mac = [string]$nic.MACAddress }
    } catch { $mac = "" }
    return @{ upn = $upn; user = "$env:USERDOMAIN\$env:USERNAME"; computer = $env:COMPUTERNAME; serial = $serial.Trim(); mac = $mac }
}

# One call to the app. The reply is read as UTF-8 here, so Arabic arrives intact.
function Invoke-App([string]$Path, [hashtable]$Body) {
    $json = $Body | ConvertTo-Json -Compress
    $response = Invoke-WebRequest -Uri ($AppUrl.TrimEnd("/") + $Path) -Method Post -UseBasicParsing -TimeoutSec 8 `
        -Headers @{ Authorization = "Bearer $ApiKey" } `
        -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($json))
    $text = [Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray())
    return $text | ConvertFrom-Json
}

# A line of text for the window. Text is always set as plain text, never read as markup.
function New-Text([string]$Text, [double]$Size = 14, [string]$Weight = "Normal", [bool]$Arabic = $false) {
    $block = New-Object System.Windows.Controls.TextBlock
    $block.Text = $Text
    $block.FontSize = $Size
    $block.FontWeight = $Weight
    $block.TextWrapping = "Wrap"
    $block.Margin = "0,0,0,8"
    if ($Arabic) { $block.FlowDirection = "RightToLeft"; $block.FontFamily = "Segoe UI, Tahoma" }
    return $block
}

# Shows one message; true when the person clicked "I've read it". $device: this PC as the app saw it.
function Show-Message($m, $device) {
    $passed = $m.result -eq "passed"
    $accent = if ($passed) { "#046B5A" } else { "#B45309" }
    $soft = if ($passed) { "#E6F4F1" } else { "#FFF4E0" }

    $window = New-Object System.Windows.Window
    $window.Title = if ($m.organisation) { "$($m.organisation) - IT" } else { "IT" }
    $window.Width = 560
    $window.SizeToContent = "Height"
    $window.MaxHeight = 720
    $window.WindowStartupLocation = "CenterScreen"
    $window.ResizeMode = "NoResize"
    $window.Topmost = $true
    $window.ShowInTaskbar = $true

    $outer = New-Object System.Windows.Controls.DockPanel
    $header = New-Object System.Windows.Controls.Border
    $header.Background = $accent
    $header.Padding = "20,16"
    [System.Windows.Controls.DockPanel]::SetDock($header, "Top")
    $titles = New-Object System.Windows.Controls.StackPanel
    $hello = if ($m.firstName) { "$($m.firstName), " } else { "" }
    $en = if ($passed) { "${hello}good job! Your workstation meets the IT standard." } else { "${hello}your workstation needs attention." }
    $ar = if ($passed) { "أحسنت! محطة عملك مطابقة لمعيار تقنية المعلومات." } else { "محطة عملك تحتاج إلى معالجة." }
    $t1 = New-Text $en 18 "SemiBold"; $t1.Foreground = "White"
    $t2 = New-Text $ar 16 "SemiBold" $true; $t2.Foreground = "White"; $t2.Margin = "0"
    [void]$titles.Children.Add($t1); [void]$titles.Children.Add($t2)
    $header.Child = $titles
    [void]$outer.Children.Add($header)

    $footer = New-Object System.Windows.Controls.Border
    $footer.Padding = "20,12"
    $footer.Background = "#F3F4F6"
    [System.Windows.Controls.DockPanel]::SetDock($footer, "Bottom")
    $button = New-Object System.Windows.Controls.Button
    $button.Content = "I've read it  |  قرأتها"
    $button.Padding = "18,8"
    $button.FontSize = 14
    $button.HorizontalAlignment = "Right"
    $button.IsDefault = $true
    $button.Background = $accent
    $button.Foreground = "White"
    $foot = New-Object System.Windows.Controls.DockPanel
    $here = New-Text ("This PC: " + $device.computer + $(if ($device.ip) { "  |  " + $device.ip } else { "" })) 12
    $here.Foreground = "#4B5563"
    $here.Margin = "0"
    $here.VerticalAlignment = "Center"
    [System.Windows.Controls.DockPanel]::SetDock($button, "Right")
    [void]$foot.Children.Add($button)
    [void]$foot.Children.Add($here)
    $footer.Child = $foot
    [void]$outer.Children.Add($footer)

    $scroll = New-Object System.Windows.Controls.ScrollViewer
    $scroll.VerticalScrollBarVisibility = "Auto"
    $body = New-Object System.Windows.Controls.StackPanel
    $body.Margin = "20,16"
    $checked = ([datetime]$m.checkedAt).ToLocalTime().ToString("d MMM yyyy")
    $meta = New-Text "$($m.computer) - checked $checked by $($m.checkedBy)" 12
    $meta.Foreground = "#6B7280"
    [void]$body.Children.Add($meta)
    if ($passed) {
        [void]$body.Children.Add((New-Text "Thank you for keeping it that way."))
        [void]$body.Children.Add((New-Text "شكرًا لمحافظتك عليها." 14 "Normal" $true))
    } else {
        [void]$body.Children.Add((New-Text "Please fix the following. If you need help, contact IT."))
        [void]$body.Children.Add((New-Text "يرجى إصلاح ما يلي. إن احتجت إلى مساعدة فتواصل مع تقنية المعلومات." 14 "Normal" $true))
        foreach ($item in @($m.toFix)) {
            $box = New-Object System.Windows.Controls.Border
            $box.Background = $soft
            $box.Padding = "12,8"
            $box.Margin = "0,0,0,8"
            $lines = New-Object System.Windows.Controls.StackPanel
            [void]$lines.Children.Add((New-Text ("- " + $item.en) 14 "SemiBold"))
            [void]$lines.Children.Add((New-Text $item.ar 13 "Normal" $true))
            if ($item.note) { [void]$lines.Children.Add((New-Text $item.note 13)) }
            $box.Child = $lines
            [void]$body.Children.Add($box)
        }
    }
    if ($m.message) {
        $note = New-Text $m.message 14 "Normal"
        $note.FontStyle = "Italic"
        $note.Margin = "0,8,0,0"
        [void]$body.Children.Add($note)
    }
    $scroll.Content = $body
    [void]$outer.Children.Add($scroll)
    $window.Content = $outer

    $script:read = $false
    $button.Add_Click({ $script:read = $true; $window.Close() })
    [void]$window.ShowDialog()
    return $script:read
}

try {
    Start-Sleep -Seconds $WaitSeconds
    Add-Type -AssemblyName PresentationFramework
    $signIn = Get-SignIn
    # Each unread result in turn, oldest first; at most five at one sign-in.
    for ($i = 0; $i -lt 5; $i++) {
        $reply = Invoke-App "/api/public/workstation/message" $signIn
        if (-not $reply.message) { break }
        $m = $reply.message
        if (-not (Show-Message $m $reply.device)) { break }
        $ack = $signIn.Clone()
        $ack.code = $m.code
        [void](Invoke-App "/api/public/workstation/message/$($m.id)/read" $ack)
    }
} catch {
    # The app off, the network down, or no key: nothing to show this time. A note for IT only.
    try { "$(Get-Date -Format s) $($_.Exception.Message)" | Out-File -FilePath "$env:TEMP\WorkstationMessage.log" -Append -Encoding utf8 } catch { }
}
