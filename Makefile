PYTHON ?= python
PIP ?= $(PYTHON) -m pip
.RECIPEPREFIX := >

.PHONY: bootstrap format lint typecheck test check pre-commit-install pre-commit-run

bootstrap:
>./scripts/bootstrap.sh

format:
>$(PYTHON) -m isort .
>$(PYTHON) -m black .

lint:
>$(PYTHON) -m flake8 .

typecheck:
>$(PYTHON) -m mypy .

test:
>$(PYTHON) -m pytest

check: lint typecheck test

pre-commit-install:
>$(PYTHON) -m pre_commit install

pre-commit-run:
>$(PYTHON) -m pre_commit run --all-files
