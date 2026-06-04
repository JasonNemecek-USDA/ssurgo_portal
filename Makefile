.PHONY: help format lint test pre-commit

help:
	@echo "Available targets: format lint test pre-commit"

format: pre-commit

lint: pre-commit

pre-commit:
	@command -v pre-commit >/dev/null 2>&1 || { echo "pre-commit not installed"; exit 1; }
	pre-commit run --all-files

test:
	@echo "No test suite is configured yet."
