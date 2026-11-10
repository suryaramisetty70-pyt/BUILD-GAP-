# BUILD-GAP- / GapLab

A no-login application for **Success–Failure Behavioral Gap Analysis for Lightweight Prompt Improvement of AI Agents**.

Anyone can open the application. Each browser receives its own anonymous workspace, identified by an HttpOnly cookie. Datasets, prompt versions, reports and interrupted live evaluations are saved server-side. Old authenticated private records are not exposed by the public interface. Clearing the cookie or changing domain/device opens a different workspace; export datasets and reports to carry them to another deployment.

## Deploy on Render

Create a **Web Service** from this repository:

| Setting | Value |
|---|---|
| Branch | `main` |
| Runtime | Node |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Node version | `24` |
| Health check | `/health` |
| `TRUST_PROXY` environment variable | `1` behind a trusted proxy for custom domains |
| `DATABASE_URL` | Your persistent PostgreSQL connection string, if using PostgreSQL |

`render.yaml` supplies these settings as a Blueprint. It does not create a paid database or service. Enter database credentials only in your hosting dashboard, never in this repository.

For the default `onrender.com` hostname, the server uses Render's automatically provided `RENDER_EXTERNAL_URL` to recognize HTTPS requests and validate their origin, including for services created without the Blueprint.

**Persistence:** If `DATABASE_URL` is set, the app uses PostgreSQL and creates its record table automatically. Otherwise it uses SQLite at `DB_PATH` (default `./storage/gaplab.sqlite`). SQLite works on a local computer or on a persistent mounted volume. Render Free web services have an ephemeral filesystem, so local SQLite data will disappear when a service restarts or redeploys. Use an external persistent PostgreSQL database for durable data on a free web service, or a persistent volume on a host that supports one. The included Docker setup mounts `/data`.

Official references: [Render Free services](https://render.com/docs/free), [Render web services](https://render.com/docs/web-services), [node-postgres connections](https://node-postgres.com/features/connecting).

## Run locally

Node.js 22.13+ is required; Node 24 is recommended.

```bash
npm ci
npm run build
npm start
```

Open `http://localhost:3000`. There is no sign-in, ChatGPT account dependency or external authentication setup. The build creates a portable frontend in `dist/public` and a separate Cloudflare-compatible build for the existing hosted version. The portable server starts from `server/portable.mjs` and uses the same API logic as the hosted app.

For Docker:

```bash
docker build -t gaplab .
docker run -p 3000:3000 -v gaplab-data:/data gaplab
```

Environment options are documented in `.env.example`. The server reads its process environment; for local env files, export their values or use Node's `--env-file` option. The app never reads a `.env` file into the browser bundle.

## Use the application

1. Open **Datasets** and add your tasks. A draft can contain one task; evaluation needs at least one training and one holdout task.
2. Define expected outcomes. Quick add supports an exact-answer check; **Edit checks as JSON** supports multiple checks, JSON fields/types, required text, word bounds and unique plan steps. Example schemas are in `data/` and `docs/EVALUATION.md`.
3. For existing outputs, enter both responses or use manual mode. For live outputs, leave responses empty.
4. Open **Prompt studio**, edit the system instructions and save a distinct candidate version.
5. For live mode, enter a **Groq API key** in **AI connection**. **Test API connection** verifies the key and lists provider model IDs without generating a chat response. Choose a chat-capable model.
6. Run a paired evaluation. Live mode sends one provider call per step and checkpoints each response. Pause after the current response, or resume interrupted work from **Experiments**. The same model, task, temperature and token limit are used for both prompts.
7. Inspect **Gap explorer**, including recovered failures and regressions. Suggestions in Prompt studio use the baseline training outputs of the selected saved report, even if the current dataset has changed.
8. Export JSON reports, CSV evidence and datasets. Reports moved to trash can be restored from Experiments.

The Groq key exists in page memory only. It is sent over HTTPS to the backend for provider requests and never saved in reports or the database. Reloading clears it. Live requests use your provider quota. No shared paid key or working AI credential is included in this public repository.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

The test suite covers the real evaluator, anonymous API with a real SQLite database, separate sessions, validation, optimistic edit conflicts, report snapshots/trash/restore, refinement from saved evidence, provider request contracts, step checkpoints, safe errors, SQLite restart persistence and the portable HTTP server. Provider responses are mocked; no real Groq key was supplied. PostgreSQL connection code is included but a live PostgreSQL instance was not available for integration verification.

See `docs/QA_REPORT.md` for browser checks and limits. No finite test run establishes that software is perfect or free of all possible bugs.

## Project structure

| Path | Purpose |
|---|---|
| `app/page.tsx`, `app/globals.css` | Responsive research interface |
| `server/api.ts` | Shared no-login application API |
| `server/store.ts` | Record-store contract and D1 adapter |
| `server/sqlite.mjs`, `server/postgres.mjs` | Portable storage adapters |
| `server/portable.mjs` | HTTP server, static assets and health endpoint |
| `src/main.tsx`, `scripts/build-portable.mjs` | Portable frontend entry and build |
| `app/api/workspace/route.ts` | Cloudflare-hosted wrapper around the shared API |
| `lib/engine.ts` | Checks, metrics, gap aggregation, training-only patching, CSV |
| `lib/fixtures.ts`, `data/` | Optional labelled synthetic examples; not preloaded |
| `tests/`, `docs/` | Verification, methodology and deployment details |
| `render.yaml`, `Dockerfile` | Deployment options |

## Research interpretation

The supplied paper proposes a three-layer prompt-evaluation workflow, not an executable released algorithm or dataset. This implementation adapts its suggested Python/MySQL stack to React/TypeScript and SQLite/PostgreSQL/D1. Refinement is a transparent rule-based patch, without model retraining. Tool/planner cases evaluate output representations; no autonomous external tools are executed.

Synthetic examples are optional and explicitly labelled. Saved-pair replay and manual mode do not measure causal prompt improvement. Only live mode produces new model outputs from the selected instructions. Deterministic reference/rubric checks are task-specific proxies, not general semantic or factuality judges. Use independent holdouts, human review and repeated real-model trials for research claims.
