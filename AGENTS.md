# SSURGO Portal Agent Instructions

These instructions are always-on for coding agents in this repository.

## Communication Preference

1. Address the user as Jason in responses unless he explicitly asks for a different name.

## Session Startup (Mandatory)

1. Read these sources before making code changes:
   - [README.md](README.md)
   - [BEST_PRACTICES.md](BEST_PRACTICES.md)
   - [skills/cicd/SKILL.md](skills/cicd/SKILL.md)
2. Launch runtime in a visible external CMD window:
   - `Set-Location C:\Users\Jason.L.Nemecek\Box\github\JasonNemecek-USDA\ssurgo_portal`
   - `.\start_ssurgo_visible.cmd`
3. Launch the UI in an external browser (not integrated browser):
   - `Start-Process 'http://localhost:8083/SSURGOPortalUI'`
4. Run startup health checks:
   - `Invoke-WebRequest -UseBasicParsing http://localhost:8083/startUp | Select-Object -ExpandProperty StatusCode`
   - `Invoke-WebRequest -UseBasicParsing http://localhost:8083/serverStatus | Select-Object -ExpandProperty StatusCode`

## Runtime Monitoring (Mandatory)

1. Keep runtime log visibility active while the app is running.
2. Treat any new `ERROR` or `CRITICAL` log class as a regression candidate until proven otherwise.
3. Use endpoint + log evidence, not UI-only observation, to claim fixes.

## Continuous Documentation Discipline (Mandatory)

After each meaningful implementation or validation step:

1. Update [CHANGELOG.md](CHANGELOG.md) under `Unreleased`.
2. Update the active task ledger in [version/V1.0.0.118-Manageable-Steps-and-Tasks.md](version/V1.0.0.118-Manageable-Steps-and-Tasks.md).
3. Update planning notes and pain points in [version/V1.0.0.118-Enhancement-Plan.md](version/V1.0.0.118-Enhancement-Plan.md) when strategy changes.
4. If a dedicated `TODO.md` exists, keep it synchronized with the task ledger. If `TODO.md` does not exist, use the versioned task markdown files as the source of truth.

## Chronicle Cadence

1. If user feedback repeats the same direction, or the same friction appears across turns, run `/chronicle improve` and apply findings.
2. Use chronicle findings to update instructions/skills so repeated guidance is captured once and reused.

## No-Regression Guardrails

1. Make the smallest safe change; avoid unrelated refactors.
2. Re-run tests and checks relevant to touched code paths before closing the task.
3. For import/download/runtime changes, include:
   - startup checks,
   - log evidence checks,
   - touched-flow smoke validation.
4. Do not mark issues as fixed without command-backed evidence.

## Workspace Hygiene

1. Do not create new one-off scripts or logs at repo root.
2. Place ad hoc artifacts under a dedicated subfolder such as `tmp/agent/`.
3. Do not delete or merge sibling directories outside this repository path without explicit user approval and an inventory/backup plan.

## Architecture Quick Map

1. Core backend logic: `version/RetryDownloadFailures-src/dlcore/`
2. Web host/server routes: `version/RetryDownloadFailures-src/dphost/`
3. Frontend UI and worker code: `version/RetryDownloadFailures-src/resources/`
4. Tests: `version/RetryDownloadFailures-src/tests/`

## Reference Docs

- [README.md](README.md)
- [BEST_PRACTICES.md](BEST_PRACTICES.md)
- [skills/cicd/SKILL.md](skills/cicd/SKILL.md)
- [CHANGELOG.md](CHANGELOG.md)
- [version/V1.0.0.118-Manageable-Steps-and-Tasks.md](version/V1.0.0.118-Manageable-Steps-and-Tasks.md)
- [version/V1.0.0.118-Must-Have-Only.md](version/V1.0.0.118-Must-Have-Only.md)
