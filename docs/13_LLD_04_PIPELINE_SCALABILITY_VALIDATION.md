# Low-Level Design — Part 4: Processing Pipeline, Scalability, Validation Framework

---

## 8. Processing Pipeline

### 8.1 Two Levels of Execution

The engine has exactly two levels of concurrency, deliberately kept simple (per ADR-021):

1. **Batch level (across articles):** N articles processed concurrently by the `WorkerPool`, each fully independent.
2. **Within-article level (across the 5 generators):** once the ICAM is frozen, `manifest_xml`, `reviews_xml`, and `transfer_xml` generation can run concurrently with each other (they share no state and don't depend on each other's output); `raw_xml` must complete before `article_xml` starts (dependency, per BR-051); all 3 concurrent generators plus `article_xml` must complete before `validation.engine` runs.

### 8.2 Single-Article Execution Flow (synchronous view within one worker)

```
ArticlePipeline.process(article_ref)
 1. input.staging.stage(article_ref)                       [sync, I/O-bound, retryable]
 2. transform.coordinator.build_model(staged) -> ArticleModel   [sync, CPU-bound]
      2a. extraction.kriyadocs_parser.parse(...)
      2b. extraction.custom_meta_classifier.classify(...)
      2c. extraction.round_resolver.resolve(...)
      2d. extraction.file_resolver.resolve(...)
      2e. builder.freeze() -> ArticleModel
 3. generation phase:
      3a. raw_xml_generator.generate(model)        -> RawXmlDocument            [sync, must finish first]
      ── fan-out (concurrent within this article, e.g. asyncio.gather or a small thread pool) ──
      3b. article_xml_generator.generate(model, raw_doc)  -> ArticleXmlDocument   [depends on 3a; calls registry.doi_registry — the one blocking I/O call in generation]
      3c. manifest_xml_generator.generate(model)   -> ManifestXmlDocument         [independent]
      3d. reviews_xml_generator.generate(model)    -> ReviewsXmlDocument          [independent]
      3e. transfer_xml_generator.generate(model)   -> TransferXmlDocument        [independent]
      ── fan-in: wait for 3b–3e ──
 4. validation.engine.validate(all 5 documents, resolved_files) -> ValidationReport   [sync]
      -> if Critical/High findings: raise the corresponding ArticleLevelError, stop here
 5. packaging.builder.build(...) -> StagedPackage                              [sync, I/O-bound]
 6. output.writer.publish(staged_package) -> PublishResult                     [sync, I/O-bound, retryable]
 7. checkpoint.store.transition(article_id, ..., COMPLETE)
 8. reporting event emitted
```

Each numbered step updates the Checkpoint Store (§9.5) before proceeding to the next, so a crash at any point leaves an unambiguous resume point.

### 8.3 Worker Communication

- The `WorkerPool` dispatches one `ArticleRef` (essentially: S3 key + article_id + correlation_id) per unit of work — **not** the full staged data — to avoid serialization overhead across process boundaries.
- Each worker independently calls `ArticlePipeline.process(article_ref)`, which performs its own staging (step 1) — workers never share a staged working directory.
- Workers communicate results back to the `RunController` via whatever the chosen concurrency mechanism natively supports (a multiprocessing result queue, or futures from a process-pool executor) — the payload is a small `ArticleOutcome` record (status, timing, error summary), never the full generated documents (those already went to S3 in step 6; re-sending them to the controller would be wasteful and is unnecessary).
- Shared, cross-worker state is limited to exactly the three things identified in the Data Flow Document: **Checkpoint Store**, **DOI Registry**, **Configuration** (read-only after load) — every other piece of state is worker-local, which is what keeps the worker communication surface this small.

---

## 9. Scalability

### 9.1 Worker Pools
- **Mechanism:** process-based pool (not threads), because the pipeline is a mix of I/O-bound (S3, DB) and CPU-bound (XML parsing/generation, DTD validation) work, and Python's GIL makes a thread pool a poor fit for the CPU-bound portions at this scale. `config/runtime.yaml`'s `concurrency.mechanism` field exists specifically so this can be revisited (e.g. moved to `asyncio` + a smaller process pool just for CPU-bound stages) without an API change to `WorkerPool`.
- **Sizing:** `worker_count` is a config value (§5.7), tuned empirically per TC-142/151 (Test Specification) rather than hard-coded — the right number depends on the actual host's CPU count and the measured I/O-wait fraction, which is exactly what the Performance Optimization phase (Roadmap Phase 7) exists to determine.
- **Isolation:** one worker crashing (e.g. an unhandled exception escaping `ArticlePipeline.process` due to a bug) must not take down the `WorkerPool` itself — the pool catches and records the failure against that one `ArticleRef`, marks it FAILED in the Checkpoint Store, and continues dispatching the remaining work (TC-149/168).

### 9.2 Queues
- **Work queue:** the `RunController` enumerates the batch (from an S3 listing or an explicit manifest) and feeds `ArticleRef`s into the `WorkerPool`'s internal work queue. For the batch-pull model (ADR-019), this is a simple in-memory queue sized to the batch (6,000–10,000 items is trivially small for an in-memory queue); the event-driven path (also permitted by ADR-019 for future incremental reprocessing) would instead use a durable external queue (e.g. SQS) feeding the same `WorkerPool.submit` interface — the interface is designed to accept either an in-memory iterable or a queue-backed iterator without change.
- **No result queue is required to be durable**: `ArticleOutcome` results are also recorded in the Checkpoint Store as they complete, so the in-memory result channel back to `RunController` is a convenience for live reporting, not the durability mechanism.

### 9.3 Memory Management
- **Per-article footprint:** bounded by (a) the staged input size (largest observed real file ~22MB; largest realistic future file potentially GB-scale per RISK-020) and (b) the in-memory ICAM + 5 generated documents, which are small (XML metadata, not full binary content — binary files are referenced by path, never loaded into the ICAM itself; see §3.6, `ResolvedFile.staged_physical_path`, not file bytes).
- **Large-file handling:** binary attachments are **never read into process memory** by any generator or the ICAM — they are streamed directly from staged-disk to the package archive (step 5) and from there to S3 (step 6), keeping peak memory roughly constant regardless of attachment size (mitigates RISK-020/RISK-021, validated by TC-146).
- **Per-worker budget:** enforced via container/process resource limits (set in `docker/` and `infra/`), with `WorkerPool` sizing (§9.1) chosen so `worker_count × per-article-peak-memory` stays within the host's available memory — a deliberately simple capacity model, revisited only if profiling (TC-144/147) shows it's insufficient.

### 9.4 Temporary/Working Storage
- Each article gets its own working subdirectory under `runtime.yaml`'s `staging.working_dir_root`, named by `article_id` (or a namespaced combination of `correlation_id`/`article_id` to avoid collision if the same article is ever reprocessed concurrently with itself — guarded against by the Checkpoint Store's compare-and-set anyway, §9.5).
- The working subdirectory is deleted after step 6 (successful publish) **or** after a terminal failure (so failed articles don't accumulate disk usage across a long batch) — never left behind as a side effect of either outcome.
- A pre-flight disk-space check runs at worker startup (not per-article, for efficiency) and periodically during a long batch, escalating to `SystemicDependencyOutageError`-style batch-pause behavior if free space drops below a safety threshold, rather than letting individual articles start failing with a confusing generic "disk full" error one by one.

### 9.5 Checkpointing
- **Granularity:** per-article, per-stage (the 9 stage names in §8.2/Data Flow Document) — matches ADR-022's confirmed design: coarse enough to be cheap to write on every transition (10,000 articles × 9 transitions is a trivial write volume for any real database), fine enough that a resumed batch retries an interrupted article from its actual last-completed stage where that's safe, and from the beginning where atomicity requires it (packaging/output, per ADR-017 — steps 5–6 are treated as one atomic unit for restart purposes even though they're logged as two checkpoint stages, specifically because ADR-017 forbids a "half-published" state from ever being resumed into rather than redone).
- **Compare-and-set semantics:** every `checkpoint.store.transition(...)` call specifies the expected current state; a mismatch (another worker already moved this article forward, or backward via a concurrent retry) returns `False` rather than throwing, and `ArticlePipeline` treats a `False` result as "abandon this attempt, another worker owns this article" — this is the mechanism preventing duplicate-dispatch (TC-183) without needing a separate distributed lock service.

### 9.6 Retry Strategy
(Full detail in Part 3 §7 Exception Framework and ADR-023; summarized here for the scalability narrative.) Every I/O-fallible operation (S3 read/write, DOI Registry call, Checkpoint Store call) is wrapped in `retry.decorators.with_retry`, which consults `retry.classifier` to distinguish `ArticleTransientError` subclasses (auto-retried with exponential backoff, capped at `runtime.yaml`'s `max_attempts`) from everything else (never retried). At batch scale, this means a transient S3 throttling event affecting many concurrent workers simultaneously results in many independent, jittered backoff-and-retry cycles rather than a thundering-herd resync — backoff jitter (a small random offset added to each computed backoff interval) is a specific implementation requirement here, not just "exponential backoff," precisely because of the shared-dependency contention this scale introduces.

---

## 10. Validation Framework

### 10.1 Design Principle
**No generator contains validation logic.** A generator's only job is to produce a document from the ICAM; the `validation.engine` is the only module that judges correctness, and it does so entirely from the *outputs* (the 5 generated documents + `ResolvedFileList`), never by asking a generator "was that right?" This separation is what makes every Business Rule Book entry independently testable (Test Specification's per-category test structure directly assumes this) and is what will catch a regression regardless of which generator introduced it.

### 10.2 Rule Plugin Architecture

```
validation.rules.<category>.<RuleClassName>   # one class per Business Rule Book rule (or tight cluster of rules)
```

Every rule is a small, stateless, independently unit-testable class implementing one shared interface:

```
ValidationRule (ABC):
    rule_id: str                     # e.g. "BR-089" — cross-referenced directly from the Business Rule Book
    severity: Severity                # Critical | High | Medium | Low (ADR-024)
    applies_to: tuple[DocumentType, ...]   # which of the 5 generated document types (+ ResolvedFileList) this rule reads

    check(context: ValidationContext) -> tuple[RuleFinding, ...]
```

`ValidationContext` bundles read-only references to all 5 generated documents and the `ResolvedFileList` — a rule declares (`applies_to`) which of these it actually needs, purely for the engine's own logging/perf-profiling ("which document types does this rule touch"), not as an access-control mechanism (all rules can see everything; the ICAM/documents are all read-only anyway).

The `ValidationEngine` (§4.8) discovers all `ValidationRule` subclasses via a registration mechanism (e.g. a decorator that appends to a module-level registry at import time, or explicit registration in `validation/rules/__init__.py` — an implementation detail, not a design decision), executes each, and aggregates `RuleFinding`s into the final `ValidationReport`, applying the `severity_block_threshold` from `runtime.yaml` (§5.7) to decide block-vs-warn.

### 10.3 Rule Categories → Modules (mirrors Business Rule Book §A–J)

| `validation/rules/` module | Business Rule Book category | Example rule classes |
|---|---|---|
| `xml_wellformedness.py` | (cross-cutting) | `WellFormednessRule` |
| `dtd_validation.py` | (cross-cutting) | `RawXmlDtdRule`, `ArticleXmlDtdRule`, `ManifestDtdRule`, `ReviewsDtdRule`, `TransferDtdRule` |
| `namespace_rules.py` | §D/E (raw/article generation) | `XlinkNamespaceUsageRule` (regression guard for the pkg3-style defect, TC-027) |
| `doi_rules.py` | §E (article.xml) | `DoiPresentRule`, `DoiFormatRule`, `DoiUniquenessRule` (delegates the actual check to `registry.doi_registry`, but the *rule that requires the check happen* lives here) |
| `manifest_rules.py` | §F | `FixedItemsPresentRule`, `ItemTypeMappingRule`, `ItemCountArithmeticRule` (BR-094) |
| `reviews_rules.py` | §G | `ReviewTypeEnumRule` (BR-099), `NoFabricatedContentRule` (BR-125), `CanonicalAttributeSchemaRule` (BR-098) |
| `transfer_rules.py` | §H | `AuthenticationCodeFormatRule`, `AcronymConfiguredRule` |
| `cross_file_rules.py` | §J | `ManifestFileCorrespondenceRule` (BR-089/153), `DateConsistencyRule` (BR-155/156) |

### 10.4 Why This Avoids Validation-in-Generators
Because every rule reads only the *document types* (plain data classes such as `ArticleXmlDocument`) and never a generator instance or the ICAM's private construction details, a developer adding a new Business Rule Book rule never needs to modify any generator — they add one new `ValidationRule` subclass and register it. This directly prevents the anti-pattern where "quick" validation logic gets bolted onto a generator (as arguably happened organically in the hand-built sample packages, where inconsistent per-package quality suggests validation wasn't systematically separated from generation) and guarantees the Test Specification's rule-by-rule test cases (TC-001 through TC-187) can each be pointed at exactly one `ValidationRule` class.
