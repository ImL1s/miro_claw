# Repository Guidelines

## Project Structure & Module Organization
`MiroFish/` is the main app and Git repository in this workspace. Work from there unless you are editing shared docs or helper tooling. `MiroFish/frontend/` contains the Vue 3 + Vite UI, with pages in `src/views/`, reusable pieces in `src/components/`, and API clients in `src/api/`. `MiroFish/backend/app/` holds the Flask API, services, models, and utilities; `MiroFish/backend/scripts/` contains validation and simulation helpers. At the workspace root, `cli/` packages the `mirofish` CLI, `docs/` stores planning notes, and `skills/` contains local agent skills.

## Build, Test, and Development Commands
Run these from `MiroFish/`:

- `npm run setup:all`: install Node dependencies and sync the backend `uv` environment.
- `npm run dev`: start Flask on `http://localhost:5001` and Vite on `http://localhost:3000`.
- `npm run backend` or `npm run frontend`: run one side only.
- `npm run build`: produce the frontend bundle.
- `docker compose up -d`: start the containerized stack with values from `.env`.

- `cd backend && uv run pytest -q`: run the backend test suite.
- `cd backend && uv run python scripts/test_profile_format.py`: run the profile-format validation script.

## Coding Style & Naming Conventions
Python uses 4-space indentation, snake_case module names, and existing docstring/type-hint patterns in API and service code. Vue and JavaScript use 2-space indentation, single quotes, and semicolon-light formatting. Keep Vue single-file components in PascalCase such as `Step3Simulation.vue`; keep API and store helpers in concise lowercase or camelCase filenames such as `simulation.js` and `pendingUpload.js`. No repo-wide ESLint, Prettier, or Ruff config is checked in, so match surrounding files closely.

## Testing Guidelines
Use `pytest` for backend changes and name new tests `test_*.py`. Prefer focused coverage around modified services or API routes, then rerun `uv run pytest -q` before opening a PR. Frontend automation is not configured yet, so include manual verification steps and screenshots for UI changes.

## Commit & Pull Request Guidelines
Recent history favors Conventional Commits, for example `feat(graph): ...`, `fix(report_agent): ...`, and `docs(readme): ...`. Follow `type(scope): imperative summary` when possible. PRs should summarize user-visible impact, list touched areas, note `.env` or API-key changes, link related issues, and include test evidence. Attach screenshots or sample request/response payloads when changing the UI or report output.

## Security & Configuration Tips
Keep secrets in local `.env` files only. Required keys include `LLM_API_KEY` and `ZEP_API_KEY`; optional accelerator settings should be added only when used. Do not commit populated `.env` files, build artifacts, or debug logs.
