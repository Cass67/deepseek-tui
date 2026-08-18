# Local Tooling

This repo's `.pre-commit-config.yaml` is configured to use locally installed tools rather than downloading hook repos.
`repo-guard` can report missing tools and offer to install them on macOS and Linux.
When possible, hooks prefer environment-local toolchains first, such as an active Python virtualenv from `$VIRTUAL_ENV`, `./.venv/bin/*`, `./venv/bin/*`, and `./node_modules/.bin/*`, then fall back to globally installed CLIs.
`repo-guard --check-tools` reports installed tool versions against minimum tested baselines instead of pinning exact versions.

Install only the tools relevant to the languages enabled for this repo.

## Base

- `pre-commit`
- `rg` (ripgrep)
- `gitleaks`

## Python

- `ruff`
- `bandit`
- `radon`
- `vulture`
- `pip-audit`

## Go

- `go`
- `goimports`
- `golangci-lint`
- `govulncheck`

## Bash

- `shfmt`
- `shellcheck`

## Rust

- `cargo`
- `cargo-audit`

## Swift

- `swiftformat`
- `swiftlint`

Note: Homebrew's `swiftlint` formula may require a full Xcode install,
not only Command Line Tools. On macOS, `repo-guard --yes` installs SwiftLint
from the official GitHub release package instead.

## C/C++

- `cppcheck`
- optional: `clang-format`
- optional: `clang-tidy`

## Ansible

- `yamllint`
- `ansible-lint`
- `djlint`

## JavaScript / TypeScript

- `eslint`
- `prettier`
- `tsc` for TypeScript repos

## Containers / Supply Chain

- `trivy`
- optional: `podman` for `repo-guard run --deep`

## Minimum Tested Versions

- Base: `pre-commit >= 3.6.0`, `rg >= 13.0.0`, `gitleaks >= 8.18.0`
- Python: `ruff >= 0.5.0`, `bandit >= 1.7.8`, `radon >= 6.0.1`, `vulture >= 2.11`, `pip-audit >= 2.7.0`
- Go: `go >= 1.22.0`, `golangci-lint >= 1.59.0`
- Bash: `shfmt >= 3.8.0`, `shellcheck >= 0.9.0`
- Rust: `cargo >= 1.75.0`, `cargo-audit >= 0.18.0`
- Swift: `swiftformat >= 0.54.0`, `swiftlint >= 0.55.0`
- C/C++: `cppcheck >= 2.13.0`
- Ansible: `yamllint >= 1.35.0`, `ansible-lint >= 24.2.0`, `djlint >= 1.34.0`
- JavaScript / TypeScript: `eslint >= 9.0.0`, `prettier >= 3.0.0`, `tsc >= 5.4.0`
- Containers / Supply Chain: `trivy >= 0.50.0`
