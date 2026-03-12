# Contributing to MiroClaw

Thank you for your interest in contributing to MiroClaw. This guide will help you get started.

## Prerequisites

- Node.js >= 18
- Python 3.11+
- [uv](https://github.com/astral-sh/uv) (Python package manager)
- Git

## Setting Up the Dev Environment

```bash
# Clone the repository (with submodules)
git clone --recursive https://github.com/ImL1s/miro_claw.git
cd miro_claw

# Set up MiroFish backend
cd MiroFish && npm run setup:all && cd ..

# Build the extension
cd extensions/mirofish && npx tsc && cd ../..
```

Copy `.env.example` to `~/.mirofish/.env` and fill in the required environment variables (see `CLAUDE.md` for details).

## Building

| Component | Command |
|:----------|:--------|
| CLI | No build step needed (plain Node.js) |
| Extension | `cd extensions/mirofish && npx tsc` |
| Backend | `cd MiroFish/backend && uv run python run.py` |

## Running Tests

### CLI Tests

```bash
node cli/test/peer-config.test.js
node cli/test/p2p.test.js
node cli/test/meta-report.test.js
node cli/test/json-stream.test.js
node cli/test/predict-json-stream.test.js
```

### CLI E2E Test

```bash
bash cli/test/e2e-p2p.sh
```

### Extension Type Check

```bash
cd extensions/mirofish && npx tsc --noEmit
```

### Backend Tests

```bash
cd MiroFish/backend && uv run pytest tests -v
```

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Format:

```
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`

Scopes: `cli`, `extension`, `p2p`, `gateway`, `backend`

Examples:
- `feat(cli): add export subcommand`
- `fix(p2p): handle peer timeout gracefully`
- `docs: update environment variable table`

## Code Style

| Language | Indent | Naming |
|:---------|:-------|:-------|
| JavaScript / TypeScript | 2 spaces | camelCase |
| Python | 4 spaces | snake_case |

TypeScript uses strict mode with ES2022 target and Node16 module resolution. The CLI has zero runtime dependencies (Node.js stdlib only).

## Pull Request Process

1. Fork the repository and create a feature branch from `main`.
2. Make your changes and ensure all tests pass.
3. Write a clear commit message following the convention above.
4. Open a pull request against `main` with a description of what changed and why.
5. Address any review feedback.

## Reporting Issues

Use the GitHub issue templates for bug reports and feature requests. For security vulnerabilities, please email the maintainers directly instead of opening a public issue.
