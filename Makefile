.PHONY: install-dev lint test typecheck build check

install-dev:
	python -m pip install -e .[dev]

lint:
	ruff check .

test:
	pytest

typecheck:
	mypy src

build:
	python -m build

check: lint typecheck test
