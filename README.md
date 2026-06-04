# ssurgo_portal

## Python developer workflow

### Supported Python versions

Use **Python 3.11 or 3.12** (`>=3.11,<3.13`).

### Bootstrap local environment

```bash
./scripts/bootstrap.sh
source .venv/bin/activate
```

### Tooling

- Formatting: `black`
- Import sorting: `isort`
- Linting: `flake8`
- Type checking: `mypy`
- Git hooks: `pre-commit`

### Common commands

```bash
make format
make lint
make typecheck
make test
make check
make pre-commit-install
make pre-commit-run
```

See `CONTRIBUTING.md` for contributor details.
