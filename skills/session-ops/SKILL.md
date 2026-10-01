# Session Ops Skill

Use this skill for each active coding session in this repository when runtime behavior, performance, or regressions are in scope.

## Communication Preference

1. Address the user as Jason unless he requests a different name.

## Objectives

1. Keep runtime launch behavior consistent (external CMD + external browser).
2. Keep evidence and documentation current as work progresses.
3. Prevent regressions by requiring command-backed validation.

## Launch Sequence (Required)

1. `Set-Location C:\Users\Jason.L.Nemecek\Box\github\JasonNemecek-USDA\ssurgo_portal`
2. `.\start_ssurgo_visible.cmd`
3. `Start-Process 'http://localhost:8083/SSURGOPortalUI'`

## Health and Monitoring (Required)

1. `Invoke-WebRequest -UseBasicParsing http://localhost:8083/startUp | Select-Object -ExpandProperty StatusCode`
2. `Invoke-WebRequest -UseBasicParsing http://localhost:8083/serverStatus | Select-Object -ExpandProperty StatusCode`
3. `Select-String -Path version\main_RunMode.SSURGO_PORTAL_UI_log.log -Pattern "RuntimeStartupMetadata|Finished refreshing supporting files|WARNING|ERROR|CRITICAL" | Select-Object -Last 60`

## End-to-End Automation (Required Before Handback)

1. Run the full smoke workflow:
	- `powershell -NoProfile -ExecutionPolicy Bypass -File skills/session-ops/scripts/run_end_to_end_smoke.ps1`
2. Treat any non-zero exit or missing `E2E_SMOKE_OK` marker as a blocking defect.
3. Record the smoke output evidence in changelog + version task ledger before handback.

## Documentation Loop (Required)

After meaningful progress:

1. Update [CHANGELOG.md](../../CHANGELOG.md) `Unreleased` section.
2. Update task progress in [version/V1.0.0.118-Manageable-Steps-and-Tasks.md](../../version/V1.0.0.118-Manageable-Steps-and-Tasks.md).
3. Add strategy/pain-point notes in [version/V1.0.0.118-Enhancement-Plan.md](../../version/V1.0.0.118-Enhancement-Plan.md) when relevant.

## Constraints

1. Follow [skills/cicd/SKILL.md](../cicd/SKILL.md) and [BEST_PRACTICES.md](../../BEST_PRACTICES.md) as mandatory gates.
2. Do not claim a fix without command/log evidence.
3. Do not create clutter at repo root; place temporary artifacts in a dedicated subfolder.
4. Do not modify sibling directories outside this repository without explicit user approval.
5. If instructions or pain points are repeated, run `/chronicle improve` and update AGENTS/instructions/skills accordingly.
