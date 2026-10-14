# Low-Level Design — Part 3: Configuration, Logging, and Exception Framework

No production code below — YAML is configuration *data* (illustrative shape only, not logic), and exception "definitions" are class names + fields, not implementations.

---

## 5. Configuration Design

### 5.1 Configuration Layers

| File | Scope | Consumed by |
|---|---|---|
| `config/journals/<journal-id>.yaml` | Per-journal constants | `generators.article_xml`, `generators.transfer_xml`, `registry.doi_registry` |
| `config/publishers/<publisher-id>.yaml` | Per-publisher constants | `generators.transfer_xml` |
| `config/media-types.yaml` | Global, extension→MIME | `extraction.file_resolver`, `generators.manifest_xml` |
| `config/license-templates.yaml` | Global, License Type→text | `generators.article_xml.license_builder` |
| `config/article-type-mapping.yaml` | Global, display-channel→article-type | `generators.article_xml` |
| `config/item-type-mapping.yaml` | Global, category→manifest item-type | `generators.manifest_xml` |
| `config/runtime.yaml` | Operational | `retry`, `orchestrator.worker_pool`, `validation.severity` |
| `config/feature-flags.yaml` | Behavioral toggles | `extraction.custom_meta_classifier`, `generators.reviews_xml` |

### 5.2 Journal Configuration — `config/journals/clinical-science.yaml`

```yaml
journal_id: "cs"                          # matches Kriyadocs journal-id[@journal-id-type=publisher-id], lower-cased
display_name: "Clinical Science"
doi_prefix: "10.1042"                     # BR-059
acronym: "<CONFIRM-VIA-ADR-007>"          # placeholder until ADR-007 resolved — must not ship with a guessed value
article_type_mapping_ref: "article-type-mapping.yaml#clinical-science"
license_templates_ref: "license-templates.yaml"
doi_registry_scope: "per-journal"         # ADR-015's confirmed scope
publisher_id: "portland-press"            # foreign key into publishers/
```

### 5.3 Publisher Configuration — `config/publishers/portland-press.yaml`

```yaml
publisher_id: "portland-press"
provider_name: "Portland Press Limited"   # BR-128
destination_provider_name: "Silverchair"  # BR-134 — becomes per-publisher config, not a global constant,
                                           # so a future publisher onboarded with a different destination
                                           # (per ADR-028) doesn't require a code change
default_contact_policy: "corresponding_author_email"   # ADR-006's resolved answer
```

### 5.4 License Mapping — `config/license-templates.yaml`

```yaml
"CC BY":
  license_type_attr: "open-access"
  license_p: >
    This is an open access article published by Portland Press Limited on behalf of
    the Biochemical Society and distributed under the Creative Commons Attribution
    License 4.0 (CC BY).
  ext_link_href: "https://creativecommons.org/licenses/by/4.0/"
# additional entries added only once ADR-002 is resolved for each real License Type value in use —
# NEVER a wildcard/default entry; an unmapped License Type must raise LicenseMappingError, not guess.
```

### 5.5 DOI Configuration
DOI prefix lives in journal config (§5.2), not a separate file — it's a per-journal constant, and duplicating it in a second file would violate single-source-of-truth. The DOI *construction formula* itself (strip `-`/`_`, preserve case) is **not** configurable — it's Confirmed (BR-058) behavior, hard-coded in `doi_builder`, since making a Confirmed rule configurable would only introduce a way to accidentally break it.

### 5.6 Media Type Mapping — `config/media-types.yaml`

```yaml
mappings:
  ".doc":  "application/msword"
  ".docx": "application/msword"            # ADR-008 default: legacy mapping, pending confirmation
  ".pdf":  "application/pdf"
  ".xlsx": "application/vnd.ms-excel"       # ADR-008 default: legacy mapping, pending confirmation
  ".jpg":  "image/jpeg"
  ".jpeg": "image/jpeg"
unmapped_extension_policy: "warn_and_default"   # or "fail" — ADR-009's confirmed policy
unmapped_extension_default: "application/octet-stream"
```

### 5.7 Runtime Settings — `config/runtime.yaml`

```yaml
concurrency:
  worker_count: 8                          # ADR-021
  mechanism: "process_pool"                # vs "thread_pool" / "async" — decided in Part 4 §9
retry:
  max_attempts: 3                          # ADR-023
  backoff_base_seconds: 2
  backoff_multiplier: 2.0
  backoff_max_seconds: 60
validation:
  dtd_validation_enabled: true             # ADR-025
  severity_block_threshold: "HIGH"         # ADR-024 — Critical/High block, Medium/Low warn-only
staging:
  strategy: "full_local_staging"           # ADR-020
  working_dir_root: "/var/meca-engine/work"
output:
  operational_bucket: "meca-output-operational"
  archival_bucket: "meca-output-archival"  # ADR-029
checkpoint:
  backend: "postgres"
doi_registry:
  backend: "postgres"
```

### 5.8 Feature Flags — `config/feature-flags.yaml`

```yaml
reviews_include_duplicate_correspondence: true    # ADR-004
reviews_extended_history_scope: true              # ADR-005 (author-suggested reviewers, editor reassignment, production queries)
strict_replication_mode: false                    # ADR-031: false = "clean mode" (production default), true = golden-test mode
```

### 5.9 Config Validation
Every YAML file above is validated at process startup (and by the `scripts/validate_config.py` CLI, runnable in CI) against a corresponding JSON Schema in `schemas/config-schema/`. A config file that fails schema validation is a **batch-level** startup failure (see §7.3) — the engine must never start processing articles against config it can't fully trust.

---

## 6. Logging Architecture

### 6.1 Log Categories

| Category | Purpose | Example Event |
|---|---|---|
| **Structured (operational)** | Machine-parseable event stream, one JSON object per line | Stage transitions, rule violations, retry attempts |
| **Audit** | Immutable record of every business-significant decision | DOI reserved, license text chosen, article-type mapped, package published |
| **Performance** | Timing/resource data per stage | Stage duration, memory high-water-mark, DTD-validation cost |
| **Error** | Failures, with full classification | Exception type, retryable flag, stack context |
| **Debug** | Verbose, disabled by default in production | Full ICAM dump on request, for local troubleshooting only |

All five categories share **one underlying structured-event schema** (§6.2) and differ only by `category` field value and by which sinks/retention policies apply to them — this avoids building five separate logging subsystems.

### 6.2 Structured Log Event Schema

```yaml
timestamp: "2026-09-07T10:22:31.123Z"     # UTC, ISO-8601, millisecond precision
correlation_id: "run-2026-09-07-0001"      # one per batch run (§6.4)
trace_id: "cs-2025-8827"                   # one per article — the article_id itself doubles as trace_id (§6.4)
stage: "generation.article_xml"            # dotted package.module path of the emitting component
category: "structured"                     # structured | audit | performance | error | debug
severity: "INFO"                           # DEBUG | INFO | WARN | ERROR | CRITICAL
rule_id: "BR-058"                          # optional — populated whenever the event is rule-triggered
message: "DOI generated: 10.1042/cs20258827"
context:                                   # free-form, category-specific structured payload
  doi: "10.1042/cs20258827"
duration_ms: null                          # populated for performance-category events
```

### 6.3 Category-Specific Notes
- **Audit** events are additionally written to an append-only store (never rotated/deleted by the normal log-retention policy) — this is the record referenced by RISK-023/Legal for dispute resolution, distinct from operational logs which can be rotated per normal ops policy.
- **Performance** events are emitted at every stage boundary in the Data Flow Document (`staging`→`metadata-loaded`→...→`archived`), each carrying `duration_ms`, feeding directly into the performance benchmarks required by Test Specification §17–18.
- **Error** events always carry the exception's full class name (from the Exception Framework, §7) and its `retryable` classification, so log-based alerting (Monitoring, ADR-030) can distinguish "expected, self-healing" from "needs a human" without re-deriving that classification from free text.
- **Debug** category is the only one gated behind a runtime flag (`config/runtime.yaml` → `logging.debug_enabled`), off by default in every environment except local dev.

### 6.4 Correlation IDs and Per-Article Trace IDs
- **`correlation_id`** identifies one batch **run** — generated once by `RunController` at run start, propagated to every article and every log line emitted during that run. Used to answer "show me everything that happened in last Tuesday's run."
- **`trace_id`** identifies one **article** — set to the article's own `article_id` (already globally meaningful and human-readable, so no separate UUID is manufactured). Propagated through the entire single-article pipeline, including across worker-process boundaries (passed explicitly into the worker task, not relying on any thread-local/global state, since `worker_pool` may use separate OS processes per ADR-021).
- **Propagation mechanism:** a context object (Python `contextvars.ContextVar`, safe across async/thread boundaries within one process; passed as an explicit argument across process boundaries) carries both ids through every function call in the pipeline, so no logging call site needs to manually thread them through — `logging_.structured_logger` reads them from context automatically when emitting.
- Every log line, regardless of category, always carries both ids — this is what makes "reconstruct exactly what happened to article X in run Y" a simple log-store query rather than a manual correlation exercise (directly satisfying the Monitoring module's per-article drill-down requirement, ADR-030).

---

## 7. Exception Framework

### 7.1 Root Hierarchy

```
MecaEngineError (base — never raised directly)
│
├── ArticleLevelError                  # stops ONLY the current article; batch continues
│   ├── SourceXmlMalformedError         (non-retryable)
│   ├── ModelBuildError                 (non-retryable — indicates an extractor code defect)
│   ├── RoundResolutionError            (non-retryable)
│   ├── FileReferenceMissingError       (non-retryable)
│   ├── ArticleTypeMappingError         (non-retryable — unmapped value, no default)
│   ├── LicenseMappingError             (non-retryable — unmapped License Type)
│   ├── MissingDoiError                 (non-retryable)
│   ├── DoiCollisionError               (non-retryable — routed to human-review queue, not silently skipped)
│   ├── ReviewDataIntegrityError        (non-retryable, Medium severity — may warn-not-block per ADR-024)
│   ├── PackageAssemblyError            (retryable IF the underlying cause is transient I/O; see §7.2)
│   └── ArticleTransientError            (retryable — see §7.2 subclasses)
│       ├── S3ReadTransientError
│       ├── S3WriteTransientError
│       ├── PostWriteIntegrityError
│       ├── DoiRegistryUnavailableError
│       └── CheckpointStoreUnavailableError
│
└── BatchLevelError                     # halts the ENTIRE run; no article-level isolation applies
    ├── ConfigurationError               # invalid/missing config at startup — nothing can safely proceed
    ├── DtdFilesMissingError              # vendored DTDs absent/corrupted — every article's validation would be meaningless
    ├── CredentialsRevokedError           # S3/DB credentials invalid — every article would fail identically
    ├── CheckpointStoreFatalError         # checkpoint backend unreachable for longer than a defined grace period
    └── SystemicDependencyOutageError     # a shared dependency (DOI registry, checkpoint store) down long enough
                                          # that per-article retry is pointless and Error Recovery escalates to batch-pause
```

### 7.2 Retryable vs. Non-Retryable, and the Transient/Permanent Boundary

- **Every `ArticleTransientError` subclass** is what `retry.classifier` recognizes as automatically retryable (ADR-023) — these are exactly the failure modes attributable to infrastructure, not data quality.
- **Every other `ArticleLevelError` subclass is non-retryable by design** — retrying a malformed source XML, an unmapped article-type, or a DOI collision will never succeed on attempt 2; `recovery.policy` routes these directly to the human-review queue / FAILED terminal state without invoking `retry.decorators` at all (this is precisely the distinction Business Rule Book BR-implicit and ADR-023 both call for).
- **`PackageAssemblyError` is dual-natured**: it is raised with an inner cause; `retry.classifier` inspects the inner cause (disk-full → transient; a genuine filename collision, TC-047/179 → non-retryable) rather than being a fixed category itself. This is the one exception type in the hierarchy that requires runtime classification rather than being statically transient/permanent by class — documented here explicitly so implementers don't assume otherwise.

### 7.3 Which Exceptions Stop the Whole Batch
Only `BatchLevelError` and its subclasses ever halt the `RunController` itself. The rule is: **if the failure's root cause would apply identically to every remaining article in the batch, it is a `BatchLevelError`; if it is specific to one article's data or one article's individual S3 object, it is an `ArticleLevelError`.**
- A malformed source XML is article-specific → `ArticleLevelError`, even though it's "permanent" (non-retryable) — the rest of the batch is unaffected (this directly implements RISK/TC "one poison-pill article must not block 9,999 others").
- Invalid AWS credentials, a missing vendored DTD file, or a config file that fails schema validation are batch-wide conditions → `BatchLevelError`, and the `RunController` must halt immediately rather than let every single article fail one-by-one with an identical, misleading per-article error.
- `SystemicDependencyOutageError` is deliberately distinct from the per-article `DoiRegistryUnavailableError`/`CheckpointStoreUnavailableError`: `recovery.policy` escalates from the latter to the former only after observing that the *same* transient dependency failure is recurring across many concurrently-processed articles within a short window — a single article hitting a one-off registry blip stays article-level and retries normally; a sustained outage escalates to a batch-wide pause so the system doesn't burn through thousands of doomed retry attempts in parallel.

### 7.4 Exception Fields (every `MecaEngineError` subclass carries these, in addition to class-specific fields)
```
article_id: Optional[str]        # None for BatchLevelError
stage: str                        # dotted module path where raised
rule_id: Optional[str]            # BR-xxx reference, when applicable
retryable: bool                   # static per class, except PackageAssemblyError (see §7.2)
inner_cause: Optional[Exception]  # original underlying exception, preserved for logging
```
