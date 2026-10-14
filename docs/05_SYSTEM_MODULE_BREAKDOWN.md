# System Module Breakdown — MECA Package Generation Engine

Conceptual design only — no implementation, no code, no class/function signatures. Each module is described by its responsibility, inputs, outputs, and dependencies on other modules. Modules map directly to the Product Backlog's epics and the Business Rule Book's rule categories.

---

## 1. Orchestrator / Run Controller
**Responsibility:** Top-level coordinator of a production run. Determines the batch of articles to process (via Input Reader), dispatches each article to a worker (respecting the concurrency model, ADR-021), consults the Checkpoint Store to skip already-completed articles, and aggregates final run status for the Reporting Engine.
**Inputs:** Run configuration (batch source location, concurrency level), Checkpoint Store state.
**Outputs:** Per-article work assignments; final run-completion signal.
**Depends on:** Configuration Manager, Checkpoint Store, Retry Manager, Monitoring.
**Not responsible for:** Any article-content transformation logic (delegated entirely to Transformation Engine).

---

## 2. Input Reader
**Responsibility:** Locates and stages one article's complete input (root Kriyadocs XML + all round folders) from the source (S3, per ADR-019), verifying basic integrity (non-empty, checksum-consistent if available) before handing off to the Metadata Extractor.
**Inputs:** S3 location (bucket/prefix/key) for one article.
**Outputs:** A staged local (or streamed) representation of the article's root XML and round folders (per the staging strategy, ADR-020).
**Depends on:** Configuration Manager (for S3 credentials/region/bucket config).
**Failure handling:** Classifies S3-level failures as transient/permanent per the Retry Manager's taxonomy (ADR-023); reports "source not found" distinctly from "source corrupted."

---

## 3. Configuration Manager (incl. Configuration Loader)
**Responsibility:** Single source of truth for every externalized constant identified across the Business Rule Book and ADRs: per-journal constants (DOI prefix, source/destination provider names, journal acronym), lookup tables (media-type-by-extension, item-type-by-category, article-type-by-display-channel, license-text-by-license-type), and operational settings (retry counts, concurrency level, validation strictness thresholds). Loads configuration once per run (or on a defined hot-reload trigger) and serves it to every other module without re-parsing per article.
**Inputs:** Versioned configuration files/store (ADR-027).
**Outputs:** Typed configuration objects consumed by every generator and the Validation Engine.
**Depends on:** Nothing (foundational module, loaded first).
**Key design note:** This module is the extension point for multi-journal/multi-publisher support (ADR-028) — every module that would otherwise hard-code a "constant" reads it from here instead.

---

## 4. Metadata Extractor
**Responsibility:** Parses the staged Kriyadocs XML into a single, complete, typed internal article model: journal-meta, article-meta (ids, categories, contrib-group, aff, author-notes, permissions, funding, kwd, counts, history), body, and the full custom-meta-group classified into {file-entries, form-answers, reviewer-scorecards, decision-drafts, decline-reasons}. This is the **one and only** place the Kriyadocs XML is parsed — every downstream generator consumes the internal model, never the raw source XML directly.
**Inputs:** Staged root XML (from Input Reader).
**Outputs:** One populated internal article model per article.
**Depends on:** Configuration Manager (for classification rules, e.g. the `QN_` prefix pattern).
**Future extensibility (ADR-018):** Designed with a pluggable "metadata source" boundary so a future database/API-backed extractor can replace or supplement the XML-based one without changing any generator.

---

## 5. File Resolver
**Responsibility:** Matches each file-entry from the Metadata Extractor's model to a physical file in the staged round folders, tolerating path-format variance (leading slash, staging-path vs. direct-input-path). Produces the authoritative "resolved file list" consumed by both the Package Builder and the Manifest Generator. Logs (but does not include) any physical file with no matching custom-meta entry.
**Inputs:** Internal article model's file-entries, staged round folders.
**Outputs:** A resolved file list: (round, category, original filename, physical path, size) tuples.
**Depends on:** Metadata Extractor, Input Reader.
**Failure handling:** An unresolvable required file reference is a hard per-article failure (not silently skipped).

---

## 6. Transformation Engine (Coordinator)
**Responsibility:** Orchestrates the 5 per-article XML generators against the shared internal model, in the correct dependency order (raw.xml first, since article.xml is derived from it; manifest/reviews/transfer can run in parallel once the model and resolved file list are ready). Not itself a generator — a thin coordination layer.
**Inputs:** Internal article model (Metadata Extractor), resolved file list (File Resolver), configuration (Configuration Manager).
**Outputs:** 5 in-memory generated XML documents, handed to the Validation Engine.
**Depends on:** All 5 generator modules below.

### 6.1 Raw XML Generator
**Responsibility:** Produces `<ArticleID>_raw.xml` — JATS Journal Publishing DTD v1.3 reformatting of the full internal model, retaining all ids, all custom-meta (all rounds, unpruned), pretty-printed, with internal workflow/log content already excluded by the Metadata Extractor's classification (nothing to strip at this stage beyond what wasn't parsed in).
**Inputs:** Internal article model.
**Outputs:** raw.xml document (in-memory), later serialized by Output Writer.
**Depends on:** Metadata Extractor.

### 6.2 Article XML Generator
**Responsibility:** Produces `<ArticleID>_article.xml` — derived from the Raw XML Generator's output model (not re-parsed from source): JATS Archiving DTD v1.2, ids stripped, DOI generated (via DOI Registry Service), license synthesized (via Configuration Manager's license-table), custom-meta pruned via the deny-list rule (latest-round file-entries only, `QN_*`/decline-reasons/decision-drafts excluded, everything else retained).
**Inputs:** Raw XML Generator's internal representation, Configuration Manager (article-type table, license table, DOI prefix), DOI Registry Service.
**Outputs:** article.xml document.
**Depends on:** Raw XML Generator, Configuration Manager, DOI Registry Service.

### 6.3 Manifest Generator
**Responsibility:** Produces `<ArticleID>_manifest.xml` — the 3 fixed metadata items plus one item per resolved file, item-type via the configured lookup table, ordered latest-round-first, with clean generated `item-description`/`item/@id` values (per the confirmed ADR-010/011 scheme, not the defective sample pattern).
**Inputs:** Resolved file list (File Resolver), internal article model (for publisher-id interpolation), Configuration Manager (item-type/media-type tables).
**Outputs:** manifest.xml document.
**Depends on:** File Resolver, Metadata Extractor, Configuration Manager.

### 6.4 Review Generator
**Responsibility:** Produces `<ArticleID>_reviews.xml` — the most interpretive generator: reconstructs one `<review>` block per (reviewer × round) from the classified reviewer-scorecard/decline-reason/decision-draft/correspondence data, splits multi-point screening messages into individual items, applies the canonical attribute schema (never the illegal `"CDATA"` literal), and respects the configured scope flags (ADR-004 duplicate-correspondence toggle, ADR-005 extended-history toggle).
**Inputs:** Internal article model's reviewer/decision/correspondence data, Configuration Manager (scope flags).
**Outputs:** reviews.xml document.
**Depends on:** Metadata Extractor, Configuration Manager.

### 6.5 Transfer Generator
**Responsibility:** Produces `<ArticleID>_transfer.xml` — largely configuration-driven (source/destination provider names, journal acronym, processing-instructions boilerplate) plus the corresponding-author email (deterministically selected when multiple exist) and the authentication-code (from the publisher-id field).
**Inputs:** Internal article model (corresponding-author email, publisher-id), Configuration Manager (provider names, acronym).
**Outputs:** transfer.xml document.
**Depends on:** Metadata Extractor, Configuration Manager.

---

## 7. DOI Registry Service
**Responsibility:** Persistent, durable store of every DOI issued by the engine (per journal, across all runs), providing atomic check-and-reserve semantics so two concurrently-processed articles can never be assigned colliding DOIs, and so a duplicate against a previous run is caught before publication (ADR-015).
**Inputs:** Candidate DOI + journal-id from the Article XML Generator.
**Outputs:** Accept (DOI reserved) or Reject (duplicate detected, article flagged for review).
**Depends on:** Configuration Manager (per-journal registry scope).
**Key design note:** Must be safe under the target concurrency level (ADR-021) — this is a shared-state component, unlike the otherwise fully-parallel per-article pipeline.

---

## 8. Validation Engine
**Responsibility:** Runs every rule from the Business Rule Book against the generated (in-memory, pre-serialization) XML documents and the resolved file list, tiered by severity (Critical/High/Medium/Low, per ADR-024). Critical/High failures block packaging; Medium/Low failures are logged as warnings and packaging proceeds. Includes structural well-formedness checks, real DTD validation (per ADR-025's confirmed scope), namespace-usage cross-checks, cross-file consistency checks (manifest↔files, date consistency), and package-level invariants.
**Inputs:** All 5 generated XML documents, resolved file list.
**Outputs:** A validation report (pass/fail per rule, tiered), and a block/proceed decision for the Package Builder.
**Depends on:** Transformation Engine, Configuration Manager (severity thresholds), Logging Framework.

---

## 9. Package Builder
**Responsibility:** Assembles the validated 5 XML documents and the resolved physical files into the final `files/<Round>/...` tree and `MECA_<ArticleID>.zip` structure, in a staged (not-yet-visible) location, only promoting the complete package to its published location once every component has succeeded (atomicity per ADR-017).
**Inputs:** 5 validated XML documents, resolved file list (with physical file bytes).
**Outputs:** A complete, staged MECA package archive.
**Depends on:** Validation Engine (must pass before packaging), File Resolver.
**Failure handling:** Any failure at this stage leaves no partial artifact at the published location; the article is retried from the packaging stage per the Checkpoint Store's stage-level granularity.

---

## 10. Output Writer
**Responsibility:** Publishes the staged package to its final destination(s): the operational S3 output location and the immutable archival location (ADR-029). Verifies post-write integrity (checksum comparison) before marking the article complete.
**Inputs:** Staged package (Package Builder).
**Outputs:** Published package at 1+ durable locations; write-confirmation signal to the Checkpoint Store.
**Depends on:** Package Builder, Configuration Manager (output/archival locations), Checkpoint Store.

---

## 11. Checkpoint Store
**Responsibility:** Durable, queryable record of every article's processing state (not-started / in-progress / complete / failed, plus which stage it reached) across the whole batch, enabling restart-without-reprocessing (ADR-022) and preventing duplicate-dispatch under concurrent processing.
**Inputs:** State transitions from the Orchestrator and every pipeline stage.
**Outputs:** Queryable per-article status; "remaining work" list for a resumed run.
**Depends on:** Nothing (foundational, shared-state module).
**Key design note:** Must support atomic compare-and-set semantics to prevent two workers from processing the same article simultaneously (TC-183).

---

## 12. Retry Manager
**Responsibility:** Wraps every externally-fallible operation (S3 reads/writes, DOI Registry calls, Checkpoint Store calls) with the confirmed retry policy (ADR-023): classifies each failure as transient or permanent, retries transient failures with exponential backoff up to a configured maximum, and immediately fails permanent (data-quality) errors without wasting retry attempts.
**Inputs:** Any operation result/exception from Input Reader, Output Writer, DOI Registry Service, Checkpoint Store.
**Outputs:** Final success/failure outcome per operation, with retry-count metadata for logging.
**Depends on:** Configuration Manager (retry counts/backoff curve).

---

## 13. Error Recovery Module
**Responsibility:** The policy layer sitting above the Retry Manager and Checkpoint Store: decides, for a given failed article, whether it is eligible for automatic retry (per Retry Manager's classification), needs to be routed to a human-review queue, or (for a systemic failure affecting many articles, e.g. a config error) should pause the whole batch rather than fail articles one-by-one.
**Inputs:** Failure classifications from every pipeline stage.
**Outputs:** Retry dispatch, human-review-queue entries, or batch-pause signals.
**Depends on:** Retry Manager, Checkpoint Store, Monitoring.

---

## 14. Logging Framework
**Responsibility:** Emits structured, per-article, per-stage log events in the confirmed schema (ADR-026): `articleId`, `stage`, `ruleId` (referencing Business Rule Book ids where applicable), `severity`, `message`, `timestamp`. Ensures log integrity under concurrent processing (no interleaved/corrupted lines, correct per-article attribution).
**Inputs:** Log events from every other module.
**Outputs:** Structured log stream (consumed by Monitoring and Reporting Engine).
**Depends on:** Configuration Manager (log schema/destination config).

---

## 15. Reporting Engine
**Responsibility:** Aggregates the Logging Framework's structured events and the Checkpoint Store's final states into a human-readable per-run summary report (success/failure/warning counts, categorized by error type, journal, and rule violated), plus per-article detail reports for anything that failed or triggered a warning (e.g. every unreferenced-physical-file warning, per BR-025/ADR-016).
**Inputs:** Logging Framework stream, Checkpoint Store final states.
**Outputs:** Run-level summary report, per-article detail reports.
**Depends on:** Logging Framework, Checkpoint Store.

---

## 16. Monitoring Module
**Responsibility:** Real-time operational visibility: per-article-level dashboard (status, retry count, failure category), and alerting when confirmed thresholds are breached (e.g. batch failure rate, per ADR-030).
**Inputs:** Logging Framework stream, Checkpoint Store state (near-real-time).
**Outputs:** Dashboards, alerts to the confirmed on-call/ownership channel.
**Depends on:** Logging Framework, Checkpoint Store, Configuration Manager (alert thresholds).

---

## Module Dependency Overview

```
Configuration Manager  ─────────────────────────────┐
        │                                           │ (config to every module)
        ▼                                           ▼
Orchestrator ── Input Reader ── Metadata Extractor ── File Resolver
        │                              │                   │
        │                              ▼                   │
        │                  Transformation Engine ◄──────────┘
        │                   ├─ Raw XML Generator
        │                   ├─ Article XML Generator ── DOI Registry Service
        │                   ├─ Manifest Generator
        │                   ├─ Review Generator
        │                   └─ Transfer Generator
        │                              │
        │                              ▼
        │                     Validation Engine
        │                              │
        │                              ▼
        │                      Package Builder
        │                              │
        │                              ▼
        │                       Output Writer ── Checkpoint Store
        │                              │
        ▼                              ▼
Retry Manager ◄──── Error Recovery Module
        │
        ▼
Logging Framework ── Reporting Engine
        │
        ▼
   Monitoring Module
```

Every module above is independently testable per the corresponding sections of `03_TEST_SPECIFICATION.md`, and independently assignable to a development team per the corresponding epics in `04_PRODUCT_BACKLOG.md`.
