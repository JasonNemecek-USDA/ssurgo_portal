---
description: "Use when implementing, validating, or closing any SSURGO Portal task. Enforces continuous markdown updates, no-regression evidence, external launch discipline, and chronicle improve cadence."
name: "Continuous Documentation and Regression Discipline"
applyTo: "**"
---
# Continuous Documentation and Regression Discipline

1. Address the user as Jason unless he requests a different name.
2. For runtime-facing work, launch with external tools first:
   - `.\start_ssurgo_visible.cmd`
   - `Start-Process 'http://localhost:8083/SSURGOPortalUI'`
3. Do not claim fixes from UI observation alone; include endpoint or log evidence.
4. After each meaningful implementation or validation step, update:
   - [CHANGELOG.md](../../CHANGELOG.md) (`Unreleased`)
   - [version/V1.0.0.118-Manageable-Steps-and-Tasks.md](../../version/V1.0.0.118-Manageable-Steps-and-Tasks.md)
   - [version/V1.0.0.118-Enhancement-Plan.md](../../version/V1.0.0.118-Enhancement-Plan.md) when strategy/pain points changed
5. If any instruction is repeated by the user or friction recurs, run `/chronicle improve` and incorporate findings into instructions/skills.
6. Keep temporary artifacts out of repo root; place them in a dedicated folder.
