#!/usr/bin/env bash
set -euo pipefail

black --check src tests
isort --check-only src tests
flake8 src tests
mypy src
pytest
