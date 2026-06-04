# ssurgo_portal

Repository baseline setup for Python development and automation.

## Developer quickstart

```bash
make install-dev
make check
```

## Repository automation

- CI checks: lint, type-check, tests, and package build on PRs and pushes to `main`
- Release build workflow on published GitHub releases
- Dependency update automation via Dependabot
- Security monitoring via CodeQL scanning

## Progress checklist

- [x] Implement code checks and automated CI
- [x] Add logging helper for consistent application logging setup
- [x] Set up automation for builds, tests, and release artifacts
- [x] Integrate dependency and security monitoring workflows
- [x] Standardize Python tooling and developer scripts
