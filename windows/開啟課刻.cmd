@echo off
setlocal
set "APP_FILE=%~dp0index.html"
set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

if not exist "%EDGE%" set "EDGE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE%" (
  start "" "%EDGE%" --app="file:///%APP_FILE:\=/%" --start-maximized
) else (
  start "" "%APP_FILE%"
)
