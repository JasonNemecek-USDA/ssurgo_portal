# Claude and Cortex Best Practices for SSURGO Portal

Last validated: 2026-06-10

## Why this file exists

This repository uses AI assistants for coding and review support. This file sets minimum safety and validation rules for Claude/Cortex-style workflows so changes remain reproducible and regression-safe.

## Authoritative USDA references

Use these as functional baseline references for behavior and UI workflow.

- Quick Start Guide: https://www.nrcs.usda.gov/sites/default/files/2024-11/SSURGO-Portal-Quick-Start-Guide.pdf
- User Guide: https://www.nrcs.usda.gov/sites/default/files/2024-11/SSURGO-Portal-User-Guide.pdf

## Reference repository snapshot

Ranking source:
- GitHub Search API (`in:name`, sorted by stars)
- Latest release-asset download counts where available

| Focus | Repository | Stars | Latest release asset downloads |
|---|---|---:|---:|
| Claude (official) | `anthropics/claude-code` | 131,493 | 1,659 |
| Cortex (AI runtime) | `janhq/cortex.cpp` | 2,758 | 17,473 |
| Cortex (serving platform) | `cortexlabs/cortex` | 8,014 | 0 |

Note: GitHub does not expose a single global "most downloaded repository" metric. Release asset downloads are used as a public proxy.

## Required workflow in this repository

1. Read this file and `version/RetryDownloadFailures-src/README.md` context before editing runtime code.
2. Make the smallest safe change and avoid unrelated refactors.
3. Run required validation commands.
4. Validate touched features against the USDA Quick Start and User Guide workflows.
5. Include command output summary in PR notes.
6. Do not merge when any required gate fails.

## Canonical checks policy

1. `skills/cicd/SKILL.md` is the canonical CI/CD check catalog.
2. This file adds repository-specific checks and does not reduce any check in `skills/cicd/SKILL.md`.
3. If either file lists a check, the check is mandatory unless there is an explicit written exception.

## Required validation commands

Run from repository root unless noted.

### Visible cmd logging launch check (blocking)

```powershell
Set-Location C:\Users\Jason.L.Nemecek\Box\github\JasonNemecek-USDA\ssurgo_portal
.\start_ssurgo_visible.cmd
```

Expected result:
- The cmd window/session remains visible while app is running.
- Startup includes both `Logging to:` and `Listening on http://::1:8083/`.
- If the cmd logging window/session does not open or startup lines are missing, fail validation.

### Python upload/runtime regression checks

```powershell
Set-Location version/RetryDownloadFailures-src
.\venv311\Scripts\python.exe -m unittest tests.test_webpage_upload -v
```

### Startup health check

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8083/startUp | Select-Object -ExpandProperty StatusCode
```

Expected result: `200` after relaunch.

### Port ownership check

```powershell
netstat -ano | findstr :8083
Get-CimInstance Win32_Process -Filter "ProcessId=<LISTENER_PID>" | Select-Object ProcessId, Name, CommandLine | Format-List
```

Expected result: active listener on `:8083` (IPv4 or IPv6) with the current app PID and expected command line.

### Pretest request lifecycle check

```powershell
$log = "C:\Users\Jason.L.Nemecek\Box\github\JasonNemecek-USDA\ssurgo_portal\version\RetryDownloadFailures-src\__main___RunMode.SSURGO_PORTAL_UI_log.log"
Select-String -Path $log -Pattern "pretestimportcandidates|Request pretestimportcandidates was successful|downloadTelemetry stage=final" | Select-Object -Last 40
```

Expected result:
- Pretest request log entry appears when Import workflow starts.
- A success or explicit error path follows; no indefinite gap.

### Long-run pretest throughput probe (diagnostic)

Run a bounded probe on the same checks as `pretestimportcandidates` before changing pretest logic.

Baseline observed on 2026-06-10:
- First 300 folders validated in ~75s (~0.25s/folder average).

### Terminal monitoring check (blocking)

```powershell
$log = "C:\Users\Jason.L.Nemecek\Box\github\JasonNemecek-USDA\ssurgo_portal\version\main_RunMode.SSURGO_PORTAL_UI_log.log"
Select-String -Path $log -Pattern "RuntimeStartupMetadata|Finished refreshing supporting files|Request .* was successful|WARNING|ERROR|CRITICAL" | Select-Object -Last 60
```

Expected result:
- Startup metadata and refresh completion are present.
- Request activity continues while UI is active.
- No new unexplained `ERROR` or `CRITICAL` entries introduced by the change.

## Mandatory anti-regression checks

1. No new `ResourceWarning: unclosed file` entries during upload/uncompress stress probes.
2. Import page controls stay context-correct:
   - Filter container is hidden on empty-state prompt.
   - Filter container is shown only when importable rows exist.
3. Existing action buttons and selection controls remain visible and usable.
4. Path-selection workflows do not silently fall back to drive root.
5. Import pretest UX must not appear frozen without diagnostics:
   - If pretests exceed expected runtime, logs must show progress signals or a terminal status.
   - Spinner-only state with no backend completion marker is a blocking regression.

## Functional parity checks (User Guide aligned)

Validate all touched flows against USDA docs before merge:

1. Import SSURGO Data flow:
   - Folder selection
   - Pretest completion
   - Import table renders with selectable records
2. SSURGO Data in Database flow:
   - Database inventory loads and actions are available
3. Soil Data Viewer flow:
   - SDV folder list and rating options load
   - Aggregation output path remains functional
4. Error messaging:
   - User receives actionable feedback for folder/data/version/projection failures

## Safety constraints

- Never run destructive git operations without explicit approval.
- Do not suppress warnings just to make tests pass.
- Do not skip runtime monitoring when touching upload or uncompress code paths.

## Prompt starter

```text
Before changing code in SSURGO Portal:
1) Read BEST_PRACTICES.md.
2) Implement the smallest safe fix.
3) Validate touched workflows against the USDA Quick Start + User Guide.
4) Run upload regression tests, startup checks, and pretest lifecycle checks.
5) Report exact commands and outcomes.
6) Stop if required checks fail and fix before merge.
```
