@echo off
REM FootyHub auto results — keeps standings + leaderboard updated from Sofascore.
REM Runs continuously (one off-screen browser, refresh every ~10 min). Surfshark/VPN must be OFF.
cd /d D:\footyhubtv-website
:loop
"C:\Users\arsis\Desktop\LIA_AI\.venv\Scripts\python.exe" update_results.py --watch --settle
echo update_results exited — restarting in 60s...
timeout /t 60 /nobreak >/dev/null
goto loop
