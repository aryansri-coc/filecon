' ==============================================================================
' CorelFlow Studio - Silent Native Desktop Launcher
' Runs server silently in background with ZERO console window,
' and opens in dedicated standalone Application Window Mode.
' ==============================================================================

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' 1. Check if server is already running on port 3000
ServerRunning = False
On Error Resume Next
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
http.open "GET", "http://localhost:3000", False
http.setTimeouts 400, 400, 400, 400
http.send
If Err.Number = 0 And http.Status = 200 Then
    ServerRunning = True
End If
On Error GoTo 0

' 2. If not running, start Node server completely hidden (0 = hidden)
If Not ServerRunning Then
    WshShell.Run "cmd /c cd /d """ & ScriptDir & """ && node server.js", 0, False
    WScript.Sleep 1500
End If

' 3. Detect Microsoft Edge or Google Chrome for Standalone App Mode
Edge64 = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
Edge32 = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
Chrome64 = "C:\Program Files\Google\Chrome\Application\chrome.exe"
Chrome32 = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

AppUrl = "http://localhost:3000"
AppArgs = " --app=" & AppUrl & " --window-size=1320,860"

If fso.FileExists(Edge64) Then
    WshShell.Run """" & Edge64 & """" & AppArgs, 1, False
ElseIf fso.FileExists(Edge32) Then
    WshShell.Run """" & Edge32 & """" & AppArgs, 1, False
ElseIf fso.FileExists(Chrome64) Then
    WshShell.Run """" & Chrome64 & """" & AppArgs, 1, False
ElseIf fso.FileExists(Chrome32) Then
    WshShell.Run """" & Chrome32 & """" & AppArgs, 1, False
Else
    WshShell.Run "cmd /c start msedge --app=" & AppUrl & " || start chrome --app=" & AppUrl & " || start " & AppUrl, 0, False
End If
