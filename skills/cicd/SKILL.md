# CI/CD Best Practices —

**Read this before any code change. Apply every applicable section. Do not skip sections because they seem slow or heavy — if a check is in this file, it must be in the pipeline or flagged as a deliberate exception.**

---

## Anti-Regression Rule

Before writing or modifying any code in this project:
1. Read this file.
2. Identify which sections apply to the change.
3. Verify the change does not remove, weaken, or bypass any existing check.
4. If a check doesn't exist yet, add it — don't defer it.


## 1. Testing Pyramid

### Unit Tests
- Test individual functions/methods in isolation using mocks/stubs
- Target ≥95% code coverage
- Tools: Jest (JS/Node), pytest (Python if added)
- For Worker code: test business logic in isolation before deploying

### Integration Tests
- Test interactions between modules, services, or external APIs
- Run after unit tests in the pipeline
- For pipeline scripts: test against ..yml

### End-to-End (E2E) Tests
- Simulate full user workflows through the API or UI
- Tools: Playwright, Cypress
- Minimum: smoke test every API endpoint after each deploy

### Regression Tests
- Automatically re-run prior test suites on every commit
- Prevent: removing a test that was catching a real bug

### Smoke Tests
- Lightweight sanity check immediately after every deploy
- `sql-sda-test.yml` already does this for SDA — model new deploys the same way
- Check: does the app boot? Do core endpoints respond?

### Performance Testing
- **Load Testing**: Simulate expected concurrent users to measure throughput and response time
- **Stress Testing**: Push beyond expected load to find the breaking point
- **Soak Testing**: Sustained load over time to detect memory leaks
- Tools: k6, Locust
- For Cloudflare Workers: Workers AI has a 10K neurons/day free tier — soak tests should respect rate limits

---

## 2. Logging

- Use structured logging (JSON format preferred) with levels: DEBUG, INFO, WARNING, ERROR, CRITICAL
- Include correlation/trace IDs for distributed tracing
- Never log PII, API keys, or secrets — the secret-scan workflow will catch committed secrets but not runtime leaks
-  use `console.log` (JSON.stringify) — logs appear in Workers dashboard
- In Node.js pipeline scripts: use a structured logger, not `console.log` with string concatenation

---

## 3. Error Handling

- Use specific exception/error types — never catch-all `catch(e)` silently
- Return meaningful HTTP status codes and messages (never expose stack traces to end users)
- Implement retry logic with exponential backoff for transient failures (SDA API calls, AI model calls)
- For Worker endpoints: always return a JSON error body with a `status` field
- For pipeline scripts: fail fast and exit non-zero so GitHub Actions marks the job as failed

---

## 4. Security (DevSecOps)

### SAST — Static Application Security Testing
- Scan source code for vulnerabilities before runtime
- `codeql.yml` already exists — do not remove or disable it
- Additional tools: Semgrep, ESLint security rules

### Dependency / SCA Scanning
- `secret-scan.yml` (Gitleaks) already exists — do not remove or disable it
- Add Dependabot config if not present: `.github/dependabot.yml`
- Tools: Snyk, OWASP Dependency-Check, GitHub Dependabot

### Secrets Management
- All secrets in GitHub repo/org secrets, never in code or config files
- Required secrets by repo — verify these exist before deploying:


### Least Privilege
- Workflow permissions: set `permissions:` explicitly in every workflow — default to read-only, add write only where needed
- Example: `permissions: contents: write` only for workflows that push to the repo

---

## 5. Code Quality Gates

- Lint on every commit: ESLint (JS), flake8/ruff (Python)
- Enforce code style: prettier (JS), black (Python)
- Fail the build on lint errors — warnings are not enough
- SonarQube or Semgrep: run on PRs, fail on CRITICAL/BLOCKER findings
- Track: code smells, duplications, technical debt

---

## 6. Accessibility (WCAG 2.1 AA / Section 508)

Applies to all HTML/JS in `docs/` (lab10yr.com public pages):
- Integrate automated accessibility scanning into CI/CD
- Tools: axe-core, Pa11y, Lighthouse CI
- Enforce: keyboard navigation, screen reader compatibility, color contrast ratios, ARIA labels
- Reference: https://www.section508.gov

---

## 7. Observability & Monitoring

- Cloudflare Workers dashboard: monitor error rate, CPU time, request count
- Set up alerts for error rate spikes, latency degradation, and pipeline failures
- Article pipeline: `pipeline-stats.json` and `PUBLISHED.md` are the observability layer — keep them current
- For new services: instrument with metrics (Prometheus/Grafana if self-hosted) or Cloudflare Analytics

### Required Runtime Monitoring for Desktop-Web Hybrid Apps (Python + local UI)

When the app is launched locally (example: Bottle/FastAPI + browser UI), enforce these checks in CI automation scripts and release runbooks:
- Start from a visible terminal session and keep logs visible during validation (`cmd`/terminal window must remain open).
- Kill stale listeners on the app port before relaunch, then verify the new PID and command line own that port.
- Smoke check startup endpoint immediately after launch (for example: `/startUp` returns HTTP 200).
- Tail the runtime log in parallel and post key lines to validation output (startup metadata + error/warning delta).
- Run a short upload/uncompress (or equivalent IO) stress probe and fail if new `ResourceWarning: unclosed file` entries appear.
- Treat new warning classes introduced by a change as regression candidates, not noise.
- Treat failure to open a visible cmd logging session as a blocking launch regression.

#### Blocking launch-and-log verification sequence (required)

Run from repository root:

```powershell
Set-Location C:\Users\Jason.L.Nemecek\Box\github\JasonNemecek-USDA\ssurgo_portal
.\start_ssurgo_visible.cmd
```

Pass criteria:
- A visible cmd window/session stays open during runtime.
- Startup output contains both `Logging to:` and `Listening on http://::1:8083/`.

Then, from a second terminal:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8083/startUp | Select-Object -ExpandProperty StatusCode
Invoke-WebRequest -UseBasicParsing http://localhost:8083/serverStatus | Select-Object -ExpandProperty StatusCode
netstat -ano | findstr :8083
```

Pass criteria:
- `/startUp` and `/serverStatus` return `200`.
- Port `8083` has an active listener owned by expected runtime process.

Then verify log evidence:

```powershell
$log = "C:\Users\Jason.L.Nemecek\Box\github\JasonNemecek-USDA\ssurgo_portal\version\main_RunMode.SSURGO_PORTAL_UI_log.log"
Select-String -Path $log -Pattern "RuntimeStartupMetadata|Finished refreshing supporting files|WARNING|ERROR|CRITICAL" | Select-Object -Last 60
```

Pass criteria:
- Startup metadata and refresh completion appear.
- No new unexplained `ERROR` or `CRITICAL` entries.

### Required UI Anti-Regression Smoke Assertions

For each release candidate, include automated assertions for previously regressed UX-critical controls:
- Action controls remain visible and enabled where expected (example: Refresh/Delete actions).
- Filter controls remain visible when the feature is enabled (do not hide advanced filters by default if they are required by workflow).
- Destructive actions requiring user target selection preserve explicit selectors (example: checkbox/radio target next to database item).
- Path-selection workflows keep non-root parent directories and do not silently fall back to drive root.

---

## 8. Pipeline Stage Order (Fast → Slow)

```
Commit / PR
  → Secrets Scan (Gitleaks)          # blocks merge if triggered
  → SAST (CodeQL / Semgrep)          # blocks merge
  → Lint / Format Check              # blocks merge
  → Unit Tests                       # blocks merge
  → Integration Tests                # blocks merge
  → Build / Package
  → Smoke Test (sql-sda-test.yml or equivalent)
  → DAST (OWASP ZAP) — on staging if applicable
  → Load / Performance Tests
  → Accessibility Scan (Lighthouse CI / axe-core)
  → SonarQube / Code Quality Gate
  → Deploy (Staging)
  → E2E / Regression Tests
  → Deploy (Production)
```

For the current GitHub Actions setup, the minimal acceptable order per repo is:

1. Secrets scan
2. SAST
3. Lint/format checks
4. Unit tests
5. Integration tests
6. Build/package
7. Smoke test
8. E2E/regression tests



---

## 9. Additional Best Practices

- **Branch Protection**: Require PR reviews + all checks passing before merge to main/master
- **Immutable Artifacts**: Build once, promote the same artifact through environments
- **Code Coverage Enforcement**: Fail pipeline if coverage drops below threshold
- **Pre-commit Hooks**: Use husky + lint-staged to catch issues before push
- **Dependabot**: Auto-create PRs for dependency updates — don't let deps go stale
- **Rollback Plan**: Every deploy must have a documented rollback. For Workers: `wrangler rollback`. For Pages: revert commit and push.
- **Audit Logging**: Log all privileged actions (admin dashboard ops) with user, timestamp, and resource

---

## 10. Testing Terminology Quick Reference

| Term | What It Does |
|---|---|
| Unit Test | Tests a single function/method in isolation |
| Integration Test | Tests interaction between components/services |
| E2E Test | Simulates full user workflows |
| Regression Test | Re-runs tests to catch regressions after changes |
| Smoke Test | Quick post-deploy sanity check |
| Load Test | Simulates expected concurrent users (e.g., 1,000) |
| Stress Test | Exceeds expected load to find breaking point |
| Spike Test | Sudden surge of users to test elasticity |
| Soak Test | Sustained load over time to detect memory leaks |
| SAST | Static code scan for vulnerabilities (pre-runtime) |
| DAST | Dynamic scan against running application |
| SCA | Scans third-party dependencies for known CVEs |
| 508 / A11y | Accessibility conformance testing (WCAG 2.1 AA) |

---

## 11. Prompt Starters

Use these when scaffolding or extending code in this project:

```
"Before making any code changes, read skills/cicd/SKILL.md and confirm the change
 doesn't regress any existing CI/CD check."

"Add unit tests with Jest for all functions — target 80% coverage."

"Add structured JSON logging with log levels and correlation IDs to the Worker."

"Set up a GitHub Actions workflow with Gitleaks secrets scan, ESLint, Jest unit tests,
 and a smoke test against the deployed Worker endpoint."

"Add retry logic with exponential backoff to all SDA API calls."

"Add Dependabot config for npm dependencies."

"Set explicit `permissions:` on every GitHub Actions workflow."

"Add a Lighthouse CI accessibility check to the pages.yml deploy workflow."

"Add a rollback step to deploy-worker.yml that triggers wrangler rollback on failure."

"Add a pre-commit husky hook that runs ESLint and prettier before every commit."

"For local Python web runtime changes, add a restart-monitor script that kills stale listeners, relaunches in a visible terminal, validates `/startUp`, and fails on new `ResourceWarning` entries during upload stress tests."
```

---

## 12. Claude/Cortex Reference Baseline

For AI-assistant repository guidance (including objective ranking snapshots and workflow instructions), also apply:

- `AI_CLAUDE_CORTEX_BEST_PRACTICES.md`

When adopting Claude/Cortex-oriented automation:
- Prefer official/vendor-maintained repos first, then pull implementation patterns from curated community repos.
- Record the exact source repo URL and retrieval date in PR notes for reproducibility.
- Re-validate commands and prompts against your own pipeline gates before merging.
