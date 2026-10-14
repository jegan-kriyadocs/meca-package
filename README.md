# MECA Archive Migration Platform

An automated pipeline that converts journal article submissions
(Kriyadocs-exported metadata + manuscript/figures/supplements) into
complete [NISO MECA](https://www.niso.org/standards-committees/meca)
packages — five generated XML files (`raw`, `article`, `manifest`,
`reviews`, `transfer`) plus the original submitted files — together
with an operator dashboard for running and monitoring migrations.

**Status:** `v1.0.0-rc1` · 164 Business Rules · 7 Recovery Rules · NISO
MECA 1.0 + JATS Archiving 1.2. See [`VERSION.md`](VERSION.md) for the
canonical version table.

This repository has two parts:

| Component | What it is | Path |
|---|---|---|
| **Engine** | Python package that does the actual conversion | `meca-engine/` |
| **Dashboard** | Node/Express + React operator UI — starts/monitors migrations, browses results, edits config | `dashboard/` |

The dashboard never runs conversion logic itself — it spawns the same
engine script an operator would run by hand
(`meca-engine/scripts/archive_migration_batch.py`) and reads its output.

---

## Prerequisites

- **Python 3.12+** (the engine's declared target; see
  [`meca-engine/README.md`](meca-engine/README.md#known-limitations-of-this-environment)
  for notes on compatibility down to 3.9 if that's all you have available).
- **Node.js 18+** (20+ recommended) and npm.
- No database, S3, or SFTP access needed — the default configuration
  reads/writes local folders only.

## Quick Start

```bash
git clone https://github.com/nagaraj665/meca-package.git
cd meca-package
```

### 1. Set up the engine

```bash
# Set up root environment (safe defaults for local dev):
cp .env.local.example .env

# Set up Python engine:
cd meca-engine
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cd ..
```

### 2. Add sample article packages

This repository does **not** include sample article data (it's
customer-derived and excluded by design — see
["Sample data" below](#sample-data)). To run a migration you need your
own input at `Input/<ArticleID>/<Round>/<file>` under the repository
root:

```bash
mkdir -p Input
# copy in your own article submission folders here
```

### 3. Run the dashboard (recommended way to operate the engine)

```bash
cd dashboard
npm run install:all   # once
npm run dev           # starts the API (port 4000) and the UI (port 5173)
```

Open `http://localhost:5173`, then use **Control Center → Start
Migration**. Every run creates a new batch under
`archive_migration_validation/batches/<batch-id>/`; the dashboard's
topbar batch selector switches every page between "Latest" and any
prior batch. See [`dashboard/README.md`](dashboard/README.md) for the
full page-by-page tour and API reference pointer.

### 4. Or run the engine directly, without the dashboard

```bash
cd meca-engine
source .venv/bin/activate
python scripts/archive_migration_batch.py --batch-id my-first-run
```

Run this from the **repository root**, not from inside `meca-engine/`
— the default configuration's `input.local_path`/`output.local_path`
(`./Input`, `./archive_migration_validation/generated_packages`) are
relative to wherever you invoke it from.

---

## Configuration

Runtime behavior (worker count, retry/backoff, logging level, package
overwrite policy, DTD validation severity threshold, input/output
provider) lives in `meca-engine/config/runtime.yaml`, validated against
`meca-engine/schemas/config-schema/`. Edit it directly, via
`python -m meca_engine.cli.main validate-config` to check it, or via
the dashboard's **Configuration** page (writes back through the same
schema validation, with automatic rollback on failure).

Secrets (only relevant once a real S3/SFTP/DB backend is wired in —
none is today) are read from environment variables, never from YAML —
see `meca-engine/.env.example` for the full list of names the engine
reads.

## Sample data

`Input/`, `Output/`, `_archive/`, and
`archive_migration_validation/batches/` are intentionally excluded from
version control (see `.gitignore`) because the only samples available
during development were real customer-derived article submissions and
their generated packages. To use this repository you'll need to supply
your own article packages under `Input/`.

**One consequence of this**: the golden-file regression suite
(`meca-engine/tests/golden/`) compares generated output against 3 real
reference MECA packages that shipped with the original development
environment but are not part of this repository. Running the full test
suite on a fresh clone will show a handful of failures in
`tests/golden/` for this reason — that's expected, not a sign your
setup is broken. Everything else (~1,160 unit/integration tests as of
this release) is self-contained and should pass.

## Testing

```bash
cd meca-engine
source .venv/bin/activate
make test-unit          # fast, self-contained
make test               # unit + integration
ruff check src tests    # lint
ruff format --check src tests
mypy src                # strict type-check
```

```bash
cd dashboard
npm run --prefix server typecheck
npm run --prefix web typecheck
npm run --prefix web build
```

## Documentation

This project's behavior is derived from a fully-approved documentation
set at the repository root — start with whichever is relevant:

- [`01_BUSINESS_RULE_BOOK.md`](01_BUSINESS_RULE_BOOK.md) — all 164
  Business Rules (also browsable in the dashboard's **Rules** page,
  alongside the 7 Recovery Rules).
- [`02_ARCHITECTURE_DECISION_RECORDS.md`](02_ARCHITECTURE_DECISION_RECORDS.md) —
  every architectural decision and its rationale.
- [`FUNCTIONAL_SPECIFICATION.md`](FUNCTIONAL_SPECIFICATION.md) —
  field-by-field source-to-output mapping.
- Numbered `03_`–`56_` documents — test specification, backlog, module
  breakdown, low-level design, milestone implementation reports, and
  the RC-1 production-readiness review, in the order they were produced.
- [`meca-engine/README.md`](meca-engine/README.md) /
  [`dashboard/README.md`](dashboard/README.md) — component-specific
  detail.

## Troubleshooting

- **`ModuleNotFoundError: meca_engine`** — activate the virtualenv
  (`source meca-engine/.venv/bin/activate`) and confirm
  `pip install -e ".[dev]"` completed without error.
- **Dashboard can't find Python / the engine** — the dashboard server
  needs a `python3` on `PATH` with the engine's dependencies installed.
  If your environment needs a specific interpreter, set
  `DASHBOARD_PYTHON_BIN`/`DASHBOARD_PYTHONPATH_EXTRA` before
  `npm run dev` (see `archive_migration_validation/Configuration_Guide.md`).
- **Port already in use (4000 or 5173)** — another process is bound to
  it; stop it or run `npm run dev --prefix server` /
  `npm run dev --prefix web` separately on different ports.
- **No batches show up in the dashboard** — you need to run at least
  one migration first (Control Center → Start Migration), which
  requires article packages under `Input/` (see
  ["Sample data"](#sample-data) above).
- **`pip install -e .` fails on Python <3.12** — the package declares
  `requires-python = ">=3.12"`; see
  [`meca-engine/README.md`](meca-engine/README.md#known-limitations-of-this-environment)
  for what was actually verified against Python 3.9.6 and what that
  does/doesn't tell you about other versions.

## License

Proprietary. See individual file headers where present.
