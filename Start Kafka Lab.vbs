' Double-click: starts Kafka Lab in the background (no window) and opens it in Chrome.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\scripts\kafka-lab.ps1"" start", 0, False
