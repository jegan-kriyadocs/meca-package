# Low-Level Design — Part 5: Testing Architecture, Deployment Architecture, Coding Standards

---

## 11. Testing Architecture

### 11.1 Unit Tests — `tests/unit/`
- **Structure:** mirrors `src/meca_engine/` exactly, one test module per source module (e.g. `tests/unit/generators/article_xml/test_doi_builder.py`).
- **Scope:** one class/function in isolation, all dependencies mocked/faked (e.g. `ArticleXmlGenerator` tested with a hand-built `ArticleModel` fixture and a fake `DoiRegistry` that always returns `RESERVED`).
- **Coverage target:** every `ValidationRule` subclass individually unit-tested against both a passing and a failing fixture document (directly operationalizes the Test Specification's per-rule test cases, e.g. TC-020/091/099 map 1:1 to a `ReviewTypeEnumRule` unit test).
- **Tooling:** `pytest`, `pytest-mock`; fixtures for a minimal valid `ArticleModel` live in `tests/conftest.py` and are composed/overridden per test rather than duplicated.

### 11.2 Integration Tests — `tests/integration/`
- **Structure:** organized by pipeline segment, not by source module — e.g. `test_extraction_to_generation.py` runs real `extraction.*` + real `generators.*` against a staged fixture, asserting on the generated documents; `test_full_pipeline_single_article.py` runs the entire `ArticlePipeline.process` against a fake S3 (e.g. an in-memory or LocalStack-backed `input.s3_client`) and a real (test-database-backed) `CheckpointStore`/`DoiRegistry`.
- **Scope:** multiple real modules together, external systems (S3, DB) faked or containerized (via `docker-compose.yml`), never mocked at the module boundary (that's what unit tests are for) — integration tests exist specifically to catch the seams unit tests can't (e.g. does `ArticleXmlGenerator`'s consumption of `RawXmlDocument` actually match what `RawXmlGenerator` produces).

### 11.3 Golden-File Regression Tests — `tests/golden/`
- **Purpose:** the 3 real sample packages are irreplaceable ground truth (`REVERSE_ENGINEERING_REPORT.md`'s entire evidence base) — this suite runs the full pipeline against each of the 3 real inputs and diffs the output against `tests/golden/expected_output/`, which encodes the **clean-mode** (ADR-031) expected result: identical to the hand-built sample except for the explicitly-approved corrections (broken manifest ids/descriptions, pkg1's illegal `review-type="CDATA"`, pkg3's missing `xmlns:xlink`, BOM presence — see Business Rule Book §14).
- **Baseline governance:** `tests/golden/expected_output/` is only ever regenerated via `scripts/rebuild_golden_baseline.py`, and only after an explicit reviewer sign-off on the diff — this file is effectively a second, machine-checked copy of the Business Rule Book's "Confirmed" classifications, and must never silently drift.
- **Strict-replication mode:** a second, optional run of this same suite with `feature-flags.yaml`'s `strict_replication_mode: true` verifies the engine *can* still reproduce the samples byte-for-byte including their defects, for historical/audit comparison — this mode is never used in production, only in this specific test suite (ADR-031).
- **Input handling:** the 3 real fixture zips under `tests/golden/fixtures/` are read-only and are never, under any circumstance, modified by test code — matching the organization's standing rule against modifying sample files.

### 11.4 Synthetic Fixture Tests — `tests/synthetic_fixtures/`
- **Purpose:** covers every scenario the 3 real samples can't (per ADR-013 and the Product Backlog's Feature 15.2): 0/1/3+/10-round articles, malformed source XML, non-CC-BY license, missing DOI, duplicate DOI, a second synthetic journal, unmapped file extensions/categories, Unicode edge cases, and every TC-0xx test case in `03_TEST_SPECIFICATION.md` that names a synthetic input.
- **Structure:** one hand-authored (or fixture-generator-script-authored) input folder per scenario, named after its Test Case ID (e.g. `tests/synthetic_fixtures/tc131_three_rounds/`), so a failing test points directly back to its Test Specification entry.
- **Growth policy:** every newly-confirmed ADR answer that introduces a previously-untestable behavior (e.g. once ADR-002 resolves the non-CC-BY license text) gets a corresponding new fixture before that behavior is considered "done," per the Backlog's Feature 15.2 acceptance criteria.

### 11.5 Performance Tests — `tests/performance/`
- **Structure:** separate from `pytest`'s normal fast-running suite (excluded from the default CI `ci.yml` run, executed on a schedule or explicitly in `golden-regression.yml`'s extended nightly variant) — covers TC-138–143 (single-article and batch-scale timing) and TC-151 (scaling-with-worker-count).
- **Tooling:** a lightweight custom harness (timing decorators feeding into the same structured-logging performance category, §6.3 of Part 3) rather than a general-purpose benchmarking framework, so performance numbers are captured via the exact same telemetry path production uses — the test *is* a production-realistic run at a controlled scale, not a separate synthetic microbenchmark.

### 11.6 Memory / Large-Batch / Recovery / Retry / Fault-Injection Tests — `tests/performance/` (memory, large-batch) and `tests/fault_injection/` (recovery, retry, S3 failure, packaging errors)
- **Fault injection mechanism:** every fallible boundary (`input.s3_client`, `output.writer`, `registry.doi_registry`, `checkpoint.store`) is implemented against a small interface (§4 class designs already specify these as swappable dependencies), and `tests/fault_injection/` provides fault-injecting fake implementations of each (e.g. a fake S3 client that raises a throttling error on the Nth call, or always corrupts the response body) — this directly operationalizes TC-160–183 (Retry, Recovery, S3 Failure, Packaging Errors) without needing a real AWS outage to test against.
- **Process-kill fault injection** (TC-118, TC-154/155): implemented as a separate test-runner script that launches `RunController` as a real subprocess and sends it `SIGKILL` at a precisely-timed point (using the structured-log stream to know exactly which stage is in progress before killing), then asserts on Checkpoint Store state and re-run behavior — this is the one test category that cannot be a pure in-process `pytest` test, since it specifically needs to prove behavior *across* a real process death.

### 11.7 Test Pyramid Summary

| Layer | Speed | Runs on every PR? | Count (approx.) |
|---|---|---|---|
| Unit | Milliseconds each | Yes | Hundreds (1+ per class/rule) |
| Integration | Seconds each | Yes | Dozens |
| Golden-file regression | Seconds (3 real articles) | Yes (mandatory gate, `golden-regression.yml`) | 3 real + strict-mode variants |
| Synthetic fixtures | Seconds each | Yes | ~1 per applicable Test Specification TC (~100+) |
| Performance | Minutes | Nightly/scheduled only | Handful, at defined scales |
| Fault injection (in-process) | Seconds each | Yes | ~30 (TC-160–183) |
| Fault injection (process-kill) | Seconds each, but flaky-prone | Nightly/scheduled only | ~6 (TC-118/154/155) |

---

## 12. Deployment Architecture

### 12.1 Local Development
- `docker-compose.yml` (Part 1 §1) brings up: the engine container (built from `docker/Dockerfile`, dev target), a LocalStack container (S3 emulation), and a Postgres container (Checkpoint Store + DOI Registry backends). One command (`make dev-up`) gets a full local stack running against synthetic fixtures — no real AWS credentials or network access required for day-to-day development.
- `scripts/validate_config.py` is run against local `config/` on every `make dev-up` to catch config schema errors immediately, before any article processing is attempted.

### 12.2 CI/CD
- **`ci.yml`** (every PR): lint (§13) → type-check → unit tests → integration tests → fault-injection (in-process) tests. Fails the PR on any failure; this is the fast-feedback gate.
- **`golden-regression.yml`** (every PR, mandatory merge gate): runs the full pipeline against the 3 real sample fixtures and diffs against `tests/golden/expected_output/` — a PR cannot merge if this diff changes without an explicit, reviewed update to the golden baseline itself (enforced by requiring the baseline-update commit and the code-change commit to be reviewed together).
- **Nightly/scheduled pipeline:** performance tests, process-kill fault-injection tests, and a larger synthetic-batch run (thousands of synthetic articles) — too slow for per-PR feedback, but running rarely enough that a regression could sit unnoticed for days is unacceptable, hence nightly rather than weekly.
- **`release.yml`** (on version tag): builds the production container image (§12.4), runs the full test suite once more against the release commit, pushes to the container registry, and tags the image with the release version — no image is ever pushed without every gate above having passed on that exact commit.

### 12.3 AWS Deployment
- **Compute:** the `WorkerPool`-driving process runs as a containerized batch job (e.g. AWS Batch, ECS task, or a Kubernetes Job — the specific orchestrator is an infrastructure choice made in `infra/`, not a design constraint from this document) sized per `infra/environments/<env>/` Terraform/CloudFormation parameters.
- **Storage:** input/operational-output/archival S3 buckets, provisioned per environment (`infra/environments/dev|staging|production/`), with IAM roles scoped to exactly the buckets/prefixes each environment's job needs (least-privilege, and a natural mitigation for RISK's credentials-related failure modes).
- **Durable state:** Checkpoint Store and DOI Registry backends run as managed database instances (e.g. RDS Postgres) per environment — never SQLite or any single-process-only store, since both must be shared safely across the `WorkerPool`'s concurrent processes (and, in production, potentially across multiple concurrent batch-job instances).
- **Secrets:** AWS credentials, DB connection strings — never in `config/` (which is version-controlled and journal/publisher-facing); sourced from a secrets manager (AWS Secrets Manager / Parameter Store) at container startup, injected as environment variables consumed only by `config.loader`, never referenced directly by any business-logic module.

### 12.4 Containerization
- **Multi-stage `Dockerfile`:** a build stage installing dependencies (via `pyproject.toml`'s locked dependency set) and running the full test suite as part of the image build (fail the build if tests fail — never ship an image that hasn't proven itself), followed by a slim runtime stage containing only the installed package + vendored DTD/config files, no build tooling.
- **One image, environment-parameterized:** the same container image is promoted across dev → staging → production (§12.5); environment differences are expressed entirely through injected config/secrets, never through a different image per environment — this is what makes "the same tested artifact reaches production" a guarantee rather than a hope.

### 12.5 Environment Promotion
- **dev → staging → production**, each environment strictly isolated (separate AWS accounts or, at minimum, separate S3 buckets/DB instances/IAM roles — never shared state across environments).
- **Promotion trigger:** a specific, already-tested container image tag (from `release.yml`) is promoted, not a new build — staging and production never build their own images from source.
- **Staging validation:** before a production promotion, staging runs a real (not synthetic) subset of the production S3 input against the same image, at reduced batch size, as the practical equivalent of Roadmap Phase 8's "first live production run at reduced scale" — staging IS that reduced-scale rehearsal environment.
- **Rollback:** because the Checkpoint Store records per-article, per-stage state, a rollback to a previous image version after a bad production promotion does not require replaying the whole batch — already-`archived` articles remain untouched; only articles left mid-pipeline resume cleanly against the rolled-back image (this is a direct, valuable consequence of the checkpointing design in Part 4 §9.5, not something the deployment architecture needs to solve separately).

### 12.6 Configuration Management (deployment view)
`config/` YAML files are packaged **into** the container image (they're versioned alongside the code they configure, per ADR-027's "config as reviewable, version-controlled artifact" decision) — they are not fetched from an external config service at runtime. A config change therefore requires a new image build/promotion through the same CI/CD gates as a code change (§12.2), which is the intended trade-off: slower to change than a live-editable config service, but every config change is reviewed, tested (including against the golden-regression suite), and traceable to a specific released image — appropriate given several config values (license text, DOI prefix) carry legal/compliance weight (RISK-008). The "hot-reload" capability mentioned in earlier ADRs (e.g. ADR-027's "no deployment needed for a config change") is satisfied at the **environment-variable/secrets layer** only (e.g. toggling a feature flag via an environment override without rebuilding the image, for genuinely low-risk operational toggles like `concurrency.worker_count`) — never for the legally/structurally sensitive tables.

---

## 13. Coding Standards

### 13.1 Python Version
**Python 3.12** (or the latest stable minor at implementation start, pinned exactly via `.python-version` and CI). Rationale: modern typing features (PEP 695 type aliases, improved `Self` support) directly simplify the ICAM's frozen-dataclass design (Part 2 §3) and the generator-generic typing (`Generator[T]`, §4.7); no requirement in this project needs compatibility with an older interpreter.

### 13.2 Typing Policy
- **Full static typing is mandatory** — every function signature, every dataclass field, every module boundary. `mypy --strict` (or an equivalent strict `pyright` configuration) runs in CI (`ci.yml`) and blocks merge on any typing error.
- **No `Any` at package boundaries** — internal helper functions may use narrowly-scoped `Any` only where genuinely unavoidable (e.g. a raw XML-library return type before it's wrapped), never on a public interface signature listed in Part 2 §4.
- **ICAM types are the contract** — every generator's public `generate` method signature must reference `ArticleModel` and its typed sub-objects, never a loosely-typed `dict`, precisely to keep the "ICAM is the only thing a generator reads" rule statically enforceable, not just documented.

### 13.3 Formatting & Linting
- **Formatter:** `ruff format` (or `black`, pinned exactly) — zero-configuration-debate formatting, enforced via `.pre-commit-config.yaml` and CI.
- **Linter:** `ruff` (covers style, common bugs, import ordering) plus `import-linter` specifically to enforce the layered import-direction rules from Part 1 §2.3 as an automated CI check, not just a documented convention.
- **Docstring linting:** enforced presence of a docstring on every public class/function (not enforcing prose quality, just presence) via `ruff`'s pydocstyle-equivalent rules.

### 13.4 Documentation Conventions
- **Every module** carries a top-of-file docstring naming the Business Rule Book category and/or ADR it implements (e.g. `generators/reviews_xml/generator.py`: *"Implements Business Rule Book §G (BR-096–125). See ADR-004, ADR-005 for configurable scope."*) — this is what keeps the code and the 10 baseline documents traceable to each other over time, as the team inevitably grows past the people who wrote this LLD.
- **Every `ValidationRule` subclass** docstring must state its `rule_id` and quote the rule's one-sentence summary from the Business Rule Book verbatim — this is a deliberate, mandatory duplication (not DRY-violating) because it's what lets a reviewer verify a test failure against the source-of-truth rule text without leaving the code.
- **API documentation** generated from docstrings (e.g. via `mkdocs` + `mkdocstrings`) and published alongside `docs/` — not hand-maintained separately.

### 13.5 Logging Conventions
- **Never use bare `print()` or the stdlib `logging` module directly** — every log emission goes through `logging_.structured_logger`, which guarantees the schema in Part 3 §6.2 (correlation_id/trace_id automatically attached from context) is always honored; a lint rule (custom `ruff` rule or a simple grep-based CI check) blocks any direct `logging.getLogger(...)` usage outside the `logging_` package itself.
- **Every raised `MecaEngineError` subclass is logged at the point it's caught and classified** (by `recovery.policy` or `retry.decorators`), not at the point it's raised — this avoids the common anti-pattern of the same error being logged multiple times as it propagates up through several `except`/re-raise layers.

### 13.6 Testing Conventions
- **Test file naming:** `test_<module_under_test>.py`, mirroring `src/` exactly (§11.1).
- **Fixture-first:** shared `ArticleModel`/config fixtures live in `conftest.py` files at the appropriate scope (package-level `conftest.py` for fixtures reused across one package's tests, root `tests/conftest.py` only for truly global fixtures) — no test builds its own ad-hoc `ArticleModel` from scratch when a shared fixture with an override would do.
- **One assertion concept per test** — a test asserting "the DOI is correct" should not also silently assert unrelated things about the license block; this keeps failures immediately diagnosable, which matters enormously given the Business Rule Book's fine-grained, individually-numbered rule structure that the tests are meant to mirror one-to-one.
- **Every new `ValidationRule` requires both a passing-fixture and a failing-fixture unit test before merge** — enforced by code-review checklist (referencing this section), not currently automatable as a hard CI gate, but flagged in PR templates.
