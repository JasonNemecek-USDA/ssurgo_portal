# Contributing

Thank you for contributing to `ssurgo_portal`.

## Getting started

1. Review [README.md](README.md) and [PLAN.md](PLAN.md).
2. Open an issue (bug, feature, or documentation) before large changes.
3. Create a focused branch and keep pull requests small.

## Pull request expectations

- Link the issue being addressed.
- Include clear problem/solution notes.
- Update docs when behavior or workflows change.
- Add or update tests for behavior changes when test infrastructure exists.
- Keep changes scoped; avoid unrelated refactors.

## Development workflow

This repository uses lightweight standards suitable for a Python-centric project baseline.

- `make format` — run formatters/hooks
- `make lint` — run linters
- `make test` — run tests

If a command is not yet wired in this repository, treat it as planned scaffolding and update as tooling is added.

## Commit guidance

- Use clear, imperative commit messages.
- Prefer one logical change per commit.
- Do not commit secrets, tokens, or sensitive data.

## Repository guidance notes

Some policies (for example branch protection/rulesets) are managed in GitHub settings by maintainers. This repository documents expectations, but organization-level controls may supersede local guidance.
