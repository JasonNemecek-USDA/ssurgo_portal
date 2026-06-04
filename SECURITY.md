# Security Policy

## Reporting a vulnerability

Please do **not** open public GitHub issues for suspected vulnerabilities.

Instead, contact maintainers through the repository support path in [SUPPORT.md](SUPPORT.md) and include:

- A clear description of the issue
- Steps to reproduce
- Potential impact
- Any suggested remediation

## Scope and expectations

- This repository follows coordinated disclosure principles.
- Maintainers will acknowledge reports as quickly as practical.
- Remediation timelines depend on severity, complexity, and operational constraints.

## Secret handling

- Never commit credentials, tokens, keys, or sensitive datasets.
- Use environment variables or approved secret-management systems.
- Rotate any accidentally exposed secret immediately.

## Security tooling

Repository security tooling and checks (for example dependency review or CodeQL) may evolve over time. Treat documented workflows as guidance until fully enforced in CI and repository rules.
