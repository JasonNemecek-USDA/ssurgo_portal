# ssurgo_portal

This repository contains the SSURGO Portal application and a versioned Python archive of the current working source.

## Project tracking

- `TODO.md` contains the current work items and best-practice cleanup tasks.
- `CHANGELOG.md` records version history for major repository changes.
- `AI_CLAUDE_CORTEX_BEST_PRACTICES.md` defines repository AI-assistant instructions and validation gates.

## Required check sources (blocking)

- `skills/cicd/SKILL.md` is the canonical CI/CD gate and check catalog.
- `BEST_PRACTICES.md` adds repository-specific runtime and USDA workflow checks.
- If a check appears in either file, treat it as required unless a reviewer grants an explicit written exception.

## Required local launch checks (blocking)

Run these checks whenever changes affect startup, runtime, logging, upload/uncompress, import flow, or UI state transitions.

### 1) Visible cmd logging check

```powershell
Set-Location C:\Users\Jason.L.Nemecek\Box\github\JasonNemecek-USDA\ssurgo_portal
.\start_ssurgo_visible.cmd
```

Pass criteria:
- A visible cmd window/session stays open while the app is running.
- Startup output includes both `Logging to:` and `Listening on http://::1:8083/`.

### 2) Startup endpoint health check

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8083/startUp | Select-Object -ExpandProperty StatusCode
Invoke-WebRequest -UseBasicParsing http://localhost:8083/serverStatus | Select-Object -ExpandProperty StatusCode
```

Pass criteria:
- Both endpoints return `200`.

### 3) Runtime log evidence check

```powershell
$log = "C:\Users\Jason.L.Nemecek\Box\github\JasonNemecek-USDA\ssurgo_portal\version\main_RunMode.SSURGO_PORTAL_UI_log.log"
Select-String -Path $log -Pattern "RuntimeStartupMetadata|Finished refreshing supporting files|Request .* was successful|ERROR|CRITICAL" | Select-Object -Last 40
```

Pass criteria:
- Startup metadata and refresh-complete lines are present.
- No new unexplained `ERROR`/`CRITICAL` entries introduced by the change.

## Notes

- The active Python source is under `version/RetryDownloadFailures-src/`.
- `version/RetryDownloadFailures 1.zip` is the archived application build.
- Refer to `skills/cicd/SKILL.md` and `BEST_PRACTICES.md` before modifying code.
