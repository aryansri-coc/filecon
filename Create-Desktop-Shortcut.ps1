# Create Desktop Shortcut for CorelFlow Studio
$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "CorelFlow Studio.lnk"
$TargetDir = $PSScriptRoot

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$TargetDir\CorelFlow Studio.vbs`""
$Shortcut.WorkingDirectory = $TargetDir
$Shortcut.Description = "CorelFlow Studio - Offline PDF and CDR Graphic Suite"
$Shortcut.WindowStyle = 7
$Shortcut.Save()

Write-Host "Desktop shortcut created successfully at: $ShortcutPath" -ForegroundColor Green
