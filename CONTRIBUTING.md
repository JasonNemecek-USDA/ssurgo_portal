# Contributing

## Python version

Use Python **3.11 or 3.12** (project requirement: `>=3.11,<3.13`).

## Setup

```bash
./scripts/bootstrap.sh
```

Then activate the environment:

```bash
source .venv/bin/activate
```

## Developer tasks

```bash
make format      # isort + black
make lint        # flake8
make typecheck   # mypy
make test        # pytest
make check       # lint + typecheck + tests
```

## Pre-commit hooks

Install hooks once:

```bash
make pre-commit-install
```

Run hooks manually:

```bash
make pre-commit-run
```
