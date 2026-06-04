# SSURGO Portal Repository Plan

This plan documents practical, repository-level improvements for `JasonNemecek-USDA/ssurgo_portal`. It is focused on code/config/documentation changes that can be implemented in-repo and tracked through issues and pull requests.

## Goals

- Establish clear governance and contributor guidance.
- Standardize repository workflows for planning, issue intake, and pull requests.
- Strengthen engineering quality with Python tooling, tests, CI/CD, and security checks.
- Improve reliability, supportability, and documentation quality for SSURGO Portal users.
- Align repository guidance with USDA/NRCS-adjacent expectations (accessibility, provenance, privacy, records, and operational discipline).

## Existing tracked issues

- [#3 — Establish repository best practices and setup](https://github.com/JasonNemecek-USDA/ssurgo_portal/issues/3)
- [#4 — Update README and documentation for project standards](https://github.com/JasonNemecek-USDA/ssurgo_portal/issues/4)
- [#6 — Master checklist: gold-standard repository tasks and best practices](https://github.com/JasonNemecek-USDA/ssurgo_portal/issues/6)
- [#9 — Create repository structure and baseline folders](https://github.com/JasonNemecek-USDA/ssurgo_portal/issues/9)
- [#11 — Add Python tooling, linting, and developer workflow](https://github.com/JasonNemecek-USDA/ssurgo_portal/issues/11)

## Recommended repository structure

```text
.
├─ .github/
│  ├─ workflows/
│  ├─ ISSUE_TEMPLATE/
│  ├─ ISSUE_TEMPLATE/config.yml
│  └─ pull_request_template.md
├─ docs/
│  ├─ architecture/
│  ├─ troubleshooting/
│  ├─ operations/
│  ├─ compliance/
│  ├─ reference/
│  └─ releases/
├─ src/
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ fixtures/
│  └─ smoke/
├─ scripts/
├─ config/
├─ .editorconfig
├─ .gitattributes
├─ .pre-commit-config.yaml
├─ Makefile
├─ CONTRIBUTING.md
├─ CODE_OF_CONDUCT.md
├─ SECURITY.md
├─ SUPPORT.md
└─ PLAN.md
```

## Epic checklist

### Governance and community
- [ ] Maintain `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, and `SUPPORT.md`
- [ ] Add `CODEOWNERS` and repository ownership map
- [ ] Keep issue and pull request templates current

### GitHub templates and branch protection policy
- [ ] Keep bug/feature/docs issue forms and PR template aligned to team process
- [ ] Document branch protection policy in repo docs (implemented in GitHub UI by maintainers)
- [ ] Define required checks and review expectations

### Python tooling and developer workflow
- [ ] Define supported Python version(s)
- [ ] Standardize formatting/linting/type-check commands
- [ ] Keep pre-commit hooks and Make targets in sync with CI

### Tests and quality
- [ ] Maintain unit/integration/smoke coverage for critical flows
- [ ] Document coverage expectations and flaky test handling
- [ ] Add regression tests for known download failure scenarios

### CI/CD
- [ ] Run lint/test/security checks on pull requests
- [ ] Add release automation and changelog workflow
- [ ] Pin third-party GitHub Actions versions

### Security
- [ ] Maintain dependency update automation and dependency review checks
- [ ] Keep secret-handling and disclosure process documentation current
- [ ] Track and triage CodeQL/security findings

### Logging and observability
- [ ] Define logging standards and redaction guidance
- [ ] Maintain troubleshooting/error catalog and runbook links
- [ ] Improve actionable user-facing failure messages

### Release hygiene
- [ ] Maintain semantic versioning and changelog discipline
- [ ] Keep release checklist and rollback notes current
- [ ] Document maintenance cadence expectations

### SonarQube and static quality gates
- [ ] Add/maintain SonarQube or SonarCloud configuration
- [ ] Enforce quality gates in CI where available
- [ ] Track code smells/coverage trends

### Documentation maturity
- [ ] Maintain architecture, troubleshooting, operations, and reference docs
- [ ] Map USDA/NRCS source references to repository docs/features
- [ ] Keep contributor onboarding and support docs current

### Accessibility / Section 508
- [ ] Add and maintain accessibility statement/checklist guidance
- [ ] Track accessibility test evidence and remediation items
- [ ] Ensure user-visible messaging follows plain-language guidance

### Data provenance
- [ ] Document external data sources and update cadence
- [ ] Maintain provenance/checksum and source-material tracking
- [ ] Document generated artifact retention guidance

### Privacy and records
- [ ] Maintain privacy/data-handling guidance appropriate to repository scope
- [ ] Document records retention/archival expectations
- [ ] Include disclaimer language for external links and third-party tools

### Project operations
- [ ] Maintain issue triage cadence and prioritization guidance
- [ ] Keep roadmap and milestone planning current
- [ ] Track cross-links between epics and implementation issues

### SSURGO-specific references and fit
- [ ] Maintain SSURGO guide links and compatibility references
- [ ] Track known incompatibilities and troubleshooting decisions
- [ ] Keep downloader/tooling version guidance current

### Gold-star extras
- [ ] Add reproducible dev environment support (devcontainer or equivalent)
- [ ] Maintain dependency/license/SBOM reporting where feasible
- [ ] Add runbooks and incident checklists for operational reliability

## Next issues to create

- [ ] Add CODEOWNERS and repository ownership map
- [ ] Add docs: architecture overview and data flow
- [ ] Add docs: troubleshooting decision tree and error catalog
- [ ] Add docs: operations runbook and support triage flow
- [ ] Add docs: privacy/data handling and records retention guidance
- [ ] Add docs: accessibility (Section 508) checklist and evidence log
- [ ] Add CI: dependency review, CodeQL, and release hygiene workflows
- [ ] Add policy doc: branch protection and required checks guidance
- [ ] Add policy doc: versioning/changelog/rollback and maintenance cadence
- [ ] Add SSURGO compatibility matrix and known incompatibilities list

## USDA/NRCS references to capture

- https://www.nrcs.usda.gov/resources/data-and-reports/ssurgo-portal
- https://www.nrcs.usda.gov/sites/default/files/2024-11/SSURGO-Portal-Quick-Start-Guide-CEC.pdf
- https://www.nrcs.usda.gov/sites/default/files/2024-11/SSURGO-Portal-Quick-Start-Guide.pdf
- https://www.nrcs.usda.gov/sites/default/files/2024-11/SSURGO-Portal-User-Guide.pdf
- https://www.nrcs.usda.gov/sites/default/files/2023-10/SSURGO%20Portal%20Installation%20Guide_0.pdf
- https://www.nrcs.usda.gov/sites/default/files/2024-08/SSURGO-Portal-Installation-Guide-CEC.pdf
- https://www.nrcs.usda.gov/sites/default/files/2023-09/SSURGO-Bulk-Downloader-ArcGIS-Pro.zip
- https://www.nrcs.usda.gov/sites/default/files/2023-09/SSURGO-Bulk-Downloader-QGIS.zip
