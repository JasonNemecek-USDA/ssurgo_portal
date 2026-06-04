# Operations Standards

This document tracks repository standards for automation and operational quality.

## Automation

- CI/CD workflow definitions should be placed in `.github/workflows/`.
- Workflow purpose and required checks should be described in repository documentation.

## Logs

- Logging formats and retention expectations should be documented per feature.
- Sensitive data must never be written to logs.

## Checks

- Quality checks should be deterministic and documented.
- Required checks for merge should be listed with failure ownership.

## Monitoring

- Monitoring and alerting expectations should include thresholds and escalation paths.
- Incident and postmortem links should be retained in project records.
