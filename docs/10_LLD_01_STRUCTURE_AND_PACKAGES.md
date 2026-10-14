# Low-Level Design — Part 1: Project Structure & Python Package Design

Baseline: all 10 prior deliverables (`REVERSE_ENGINEERING_REPORT.md` through `09_FINAL_READINESS_REPORT.md`). This LLD assumes **Python 3.12+** (rationale in Part 5, `14_LLD_05_TESTING_DEPLOYMENT_STANDARDS.md`) and a `src/`-layout package. No production code appears below — folder trees, package/module names, and interface *signatures* (names + types, no bodies) only, as the standard notation for this kind of design document.

---

## 1. Project Folder Structure

```
meca-engine/
├── README.md                          # onboarding entry point; links to all 10 baseline docs
├── pyproject.toml                     # single source of truth: deps, build, tool config (ruff/mypy/pytest)
├── setup.cfg                          # legacy-tool shims only if a dependency needs it
├── Makefile                           # make lint / make test / make run-local — one-word dev commands
├── .pre-commit-config.yaml            # enforces lint/format/type-check before commit (Coding Standards, Part 5)
├── .python-version                    # pins exact interpreter for local dev parity with CI/CD
│
├── .github/                           # (or .gitlab-ci/, per actual VCS host)
│   └── workflows/
│       ├── ci.yml                     # lint + unit + integration on every PR
│       ├── golden-regression.yml      # runs the 3-real-sample regression baseline on every PR
│       └── release.yml                # build + push container image on tag
│
├── docker/
│   ├── Dockerfile                     # multi-stage: build deps → slim runtime image
│   ├── docker-compose.yml             # local stack: engine + mock-S3 (e.g. LocalStack) + Postgres (checkpoint/DOI registry)
│   └── entrypoint.sh                  # container startup: config validation, then hand off to the run controller
│
├── src/
│   └── meca_engine/                   # the one importable top-level package — see §2 for internals
│       └── ...                        # (full breakdown in §2)
│
├── config/                            # version-controlled configuration (ADR-027) — NOT secrets
│   ├── journals/
│   │   └── clinical-science.yaml      # one file per onboarded journal (ADR-028 extension point)
│   ├── publishers/
│   │   └── portland-press.yaml        # one file per onboarded publisher
│   ├── media-types.yaml               # extension → MIME lookup table (ADR-008/009)
│   ├── license-templates.yaml         # License Type → license-p boilerplate (ADR-002)
│   ├── article-type-mapping.yaml      # display-channel → article-type (ADR-001)
│   ├── item-type-mapping.yaml         # custom-meta category → manifest item-type (BR-078)
│   ├── runtime.yaml                   # retry counts, concurrency level, timeouts (ADR-023, ADR-021)
│   └── feature-flags.yaml             # ADR-004/005 scope toggles, strict-vs-clean mode (ADR-031)
│
├── schemas/
│   ├── dtd/                           # vendored DTDs for real validation (ADR-025)
│   │   ├── jats-publishing-1.3/
│   │   ├── jats-archiving-1.2/
│   │   └── meca-1.0/                  # manifest, reviews, transfer DTDs
│   └── config-schema/                 # JSON Schema for validating the YAML files in config/ at load time
│
├── tests/
│   ├── unit/                          # one subfolder per src package, mirrors src/ tree exactly
│   ├── integration/                   # multi-module flows (e.g. Extractor → Generators → Validator)
│   ├── golden/                        # golden-file regression — the 3 real sample packages
│   │   ├── fixtures/                  # the ORIGINAL input zips, read-only, never modified (org rule)
│   │   └── expected_output/           # the approved-clean-mode expected output per ADR-031
│   ├── synthetic_fixtures/            # 0/1/3+/10-round articles, malformed XML, non-CC-BY, 2nd journal, etc.
│   ├── performance/                   # load/perf harness + baselines
│   ├── fault_injection/               # S3 outage, mid-process kill, disk-full simulators
│   └── conftest.py                    # shared pytest fixtures (in-memory config, fake S3, fake registry)
│
├── docs/
│   ├── baseline/                      # copies of/links to the 10 prior deliverable documents
│   ├── adr/                           # ADR-001..031 as individual files once ACCEPTED (living record)
│   └── runbooks/                      # on-call operational procedures (RISK-025)
│
├── scripts/                           # small operator-facing entry points, not part of the library API
│   ├── run_batch.py                   # CLI: trigger a batch run against a given S3 prefix
│   ├── validate_config.py             # CLI: validate config/ against config-schema/ before deploy
│   ├── seed_doi_registry.py           # CLI: one-time import of historically-issued DOIs
│   └── rebuild_golden_baseline.py     # CLI: regenerate tests/golden/expected_output/ (requires sign-off to run)
│
├── infra/                             # Infrastructure-as-Code (Terraform or CloudFormation)
│   ├── modules/                       # S3 buckets, RDS/DynamoDB for checkpoint+registry, SQS if used, IAM
│   └── environments/
│       ├── dev/
│       ├── staging/
│       └── production/
│
└── .gitignore                         # excludes local logs/, .venv/, staged article working folders
```

**Why each top-level folder exists:**
- `src/meca_engine/` — the only place business logic lives; everything else is tooling, config, or tests around it.
- `config/` is separated from `src/` because it changes on a different cadence and by different people (operators/business, not only engineers) — this is the physical embodiment of ADR-027's "config as reviewable, version-controlled artifact" decision.
- `schemas/dtd/` exists because ADR-025 requires real DTD files to be vendored and version-pinned (RISK-023) — they are data, not code, so they live outside `src/`.
- `tests/golden/` is deliberately separate from `tests/synthetic_fixtures/` — golden tests protect the 3 real, evidence-backed samples (never edited); synthetic fixtures cover everything the real samples can't (Backlog Feature 15.2).
- `infra/` is separated from `docker/` because one is "how the app is packaged" and the other is "what infrastructure it runs on" — different lifecycles, different owners (Engineering vs. DevOps).
- `scripts/` holds one-off/operator CLIs that are not imported by the library itself — kept out of `src/` to avoid them becoming accidental internal dependencies.

---

## 2. Python Package Design

### 2.1 Package Layout Under `src/meca_engine/`

```
meca_engine/
├── __init__.py                # exposes package version only; no logic
│
├── model/                     # ICAM — Internal Canonical Article Model (see Part 2 doc)
│   ├── __init__.py
│   ├── article.py             # ArticleModel and its sub-objects
│   ├── enums.py                # RoundName-agnostic round type, ReviewOutcome, LicenseType, etc.
│   └── collections.py         # typed collections: ContributorList, FileEntryList, ReviewEventList
│
├── config/                    # Configuration Manager (Module 3)
│   ├── __init__.py
│   ├── loader.py               # reads/validates YAML against schemas/config-schema/
│   ├── schema.py               # typed config dataclasses (JournalConfig, PublisherConfig, RuntimeConfig...)
│   └── registry.py             # in-memory config cache, keyed by journal-id/publisher-id (ADR-028)
│
├── exceptions/                 # Exception Framework (Part 3 doc)
│   ├── __init__.py
│   ├── base.py                  # MecaEngineError root
│   ├── article_errors.py        # per-article, retryable/non-retryable subclasses
│   └── batch_errors.py          # whole-batch-halting subclasses
│
├── input/                      # Input Reader (Module 2)
│   ├── __init__.py
│   ├── s3_client.py              # thin S3 wrapper, all calls routed through retry.decorators
│   └── staging.py                # local/ephemeral working-folder management (ADR-020)
│
├── extraction/                 # Metadata Extractor + File Resolver (Modules 4–5)
│   ├── __init__.py
│   ├── kriyadocs_parser.py       # the ONLY module allowed to parse the source XML
│   ├── custom_meta_classifier.py # classifies custom-meta into file-entry/form-answer/scorecard/etc.
│   ├── file_resolver.py          # resolves custom-meta file-entries to staged physical files
│   └── round_resolver.py         # vocab-identifier-based round ordering (BR-010)
│
├── transform/                   # Transformation Engine coordinator (Module 6)
│   ├── __init__.py
│   └── coordinator.py            # builds the finalized ICAM instance ready for generators
│
├── generators/                  # one subpackage per output XML — NEVER import each other
│   ├── __init__.py
│   ├── base.py                    # Generator ABC — shared interface only, no shared XML logic
│   ├── raw_xml/
│   │   ├── __init__.py
│   │   └── generator.py
│   ├── article_xml/
│   │   ├── __init__.py
│   │   ├── generator.py
│   │   ├── doi_builder.py          # DOI formula (BR-058)
│   │   └── license_builder.py      # license synthesis (ADR-002)
│   ├── manifest_xml/
│   │   ├── __init__.py
│   │   ├── generator.py
│   │   └── item_type_mapper.py     # category → item-type lookup (BR-078)
│   ├── reviews_xml/
│   │   ├── __init__.py
│   │   ├── generator.py
│   │   ├── review_builder.py       # per-reviewer-per-round review blocks
│   │   └── decision_builder.py     # editorial decision blocks
│   └── transfer_xml/
│       ├── __init__.py
│       └── generator.py
│
├── registry/                    # DOI Registry Service (Module 7)
│   ├── __init__.py
│   ├── doi_registry.py            # check-and-reserve interface
│   └── backends/                   # pluggable storage backend (Postgres/DynamoDB)
│
├── validation/                   # Validation Engine (Module 8)
│   ├── __init__.py
│   ├── engine.py                   # runs all rules, applies severity tiering (ADR-024)
│   ├── rules/                      # one file per Business-Rule-Book category (mirrors §A–J)
│   │   ├── xml_wellformedness.py
│   │   ├── dtd_validation.py
│   │   ├── namespace_rules.py
│   │   ├── cross_file_rules.py
│   │   └── ... (one per BR category)
│   └── severity.py                 # Critical/High/Medium/Low tiering logic
│
├── packaging/                    # Package Builder (Module 9)
│   ├── __init__.py
│   └── builder.py                  # atomic stage-then-publish assembly (ADR-017)
│
├── output/                       # Output Writer (Module 10)
│   ├── __init__.py
│   └── writer.py                   # publishes to operational + archival locations (ADR-029)
│
├── checkpoint/                   # Checkpoint Store (Module 11)
│   ├── __init__.py
│   ├── store.py                    # atomic per-article state interface
│   └── backends/
│
├── retry/                        # Retry Manager (Module 12)
│   ├── __init__.py
│   ├── classifier.py                # transient vs. permanent (ADR-023)
│   └── decorators.py                # reusable retry wrapper used by input/, output/, registry/
│
├── recovery/                     # Error Recovery Module (Module 13)
│   ├── __init__.py
│   └── policy.py                    # routes failures to retry / human-review-queue / batch-pause
│
├── logging_/                     # Logging Framework (Module 14) — trailing underscore avoids stdlib clash
│   ├── __init__.py
│   ├── structured_logger.py
│   └── correlation.py                # correlation-id / trace-id propagation (Part 3 doc)
│
├── reporting/                    # Reporting Engine (Module 15)
│   ├── __init__.py
│   └── report_builder.py
│
├── monitoring/                   # Monitoring Module (Module 16)
│   ├── __init__.py
│   └── metrics.py                    # emits to whatever metrics backend is chosen (CloudWatch etc.)
│
├── orchestrator/                 # Orchestrator / Run Controller (Module 1) — top of the dependency graph
│   ├── __init__.py
│   ├── run_controller.py
│   ├── article_pipeline.py           # the single-article state machine (§8 Processing Pipeline)
│   └── worker_pool.py                # concurrency management (ADR-021)
│
└── utils/                         # small, dependency-free helpers only (no business logic)
    ├── __init__.py
    ├── xml_utils.py                  # pretty-printing, escaping helpers shared across generators
    └── hashing.py                     # checksum helpers used by input/ and output/
```

### 2.2 Package Responsibilities (one line each, full detail in `11_LLD_02...` Part 4)

| Package | Responsibility | Maps to Module (05 doc) |
|---|---|---|
| `model` | ICAM definition — the one shape every other package agrees on | New (foundational) |
| `config` | Load/validate/serve all externalized configuration | Configuration Manager |
| `exceptions` | Typed error hierarchy, retryable vs. fatal | New (foundational) |
| `input` | S3 staging | Input Reader |
| `extraction` | Parse Kriyadocs XML → ICAM, resolve files | Metadata Extractor, File Resolver |
| `transform` | Finalize ICAM for generator consumption | Transformation Engine |
| `generators.*` | Produce the 5 output XMLs | Raw/Article/Manifest/Review/Transfer Generators |
| `registry` | DOI uniqueness | DOI Registry Service |
| `validation` | Run Business Rule Book checks, severity-tiered | Validation Engine |
| `packaging` | Atomic zip assembly | Package Builder |
| `output` | Publish operational + archival | Output Writer |
| `checkpoint` | Per-article durable state | Checkpoint Store |
| `retry` | Transient/permanent classification + backoff | Retry Manager |
| `recovery` | Failure-routing policy | Error Recovery Module |
| `logging_` | Structured logs, correlation ids | Logging Framework |
| `reporting` | Run/article summaries | Reporting Engine |
| `monitoring` | Dashboards/alerts | Monitoring Module |
| `orchestrator` | Top-level coordination, concurrency | Orchestrator |
| `utils` | Shared stateless helpers | (cross-cutting) |

### 2.3 Import Direction Rules (enforced by CI lint rule, e.g. `import-linter`)

```
                         ┌───────────────┐
                         │ orchestrator  │  ← top layer; imports everything below, nothing imports it
                         └───────┬───────┘
                                 │
        ┌──────────┬────────────┼─────────────┬────────────┐
        ▼          ▼            ▼              ▼            ▼
   input/     recovery/    packaging/     reporting/   monitoring/
        │          │            │              │            │
        ▼          ▼            ▼              ▼            ▼
     retry/    checkpoint/  output/        logging_/   (reads checkpoint/logging_ only)
        │                        │
        └────────────┬───────────┘
                      ▼
              validation/  ← imports model + generators' OUTPUT type only, never generator internals
                      ▲
                      │
        ┌─────────────┴─────────────┐
        ▼                            ▼
  generators.*                  registry/
   (raw/article/manifest/          ▲
    reviews/transfer —             │
    NEVER import each other) ──────┘ (article_xml imports registry for DOI check)
        ▲
        │
   transform/
        ▲
        │
  extraction/
        ▲
        │
     model/  ◄── config/  ◄── exceptions/  ◄── utils/   (foundation layer — zero business-logic deps)
```

**Rules enforced:**
1. `model/`, `config/`, `exceptions/`, `utils/` depend on nothing else in the package (foundation layer) — this is what makes the ICAM genuinely "canonical": nothing it depends on can create a cycle back to it.
2. No `generators.*` subpackage imports another `generators.*` subpackage. Each generator depends only on `model`, `config`, `utils`, and (article_xml only) `registry`. This directly enforces the Functional Spec's "each generator is independently testable" property and prevents the kind of accidental coupling that produced pkg1's non-canonical reviews.xml schema in the hand-built samples.
3. `validation/` depends on `model` and on the *generated document types* the generators emit (a `RawXmlDocument`, `ArticleXmlDocument`, etc. — plain data, not generator logic), never on generator internals. This means validation rules can be unit-tested against hand-built fixture documents without invoking any generator.
4. `orchestrator/` is the only package permitted to import from every other package; nothing else may import `orchestrator/` (prevents the classic "orchestrator logic leaks into a worker module" anti-pattern).
5. `checkpoint/`, `retry/`, `recovery/`, `registry/` are mutually independent (no cross-imports among them) — each is consumed directly by `orchestrator/` or by the specific stage that needs it (e.g. `input/` uses `retry/` directly, not via `orchestrator/`).

This layering guarantees **zero import cycles by construction**: every arrow above points strictly downward; a cycle would require an arrow pointing back up, which the import-linter CI check rejects at PR time (see Part 5, Coding Standards).
