# End-to-End Data Flow — MECA Package Generation Engine

This document traces one article's complete journey through the system, and how that scales to a 6,000–10,000-article batch run. Maps directly to the modules in `05_SYSTEM_MODULE_BREAKDOWN.md`.

---

## High-Level Flow

```
   Amazon S3 (input)
        │
        ▼
   [1] Working Folder / Staging
        │
        ▼
   [2] Metadata Loading
        │
        ▼
   [3] Pre-Transformation Validation
        │
        ▼
   [4] Transformation (internal model build)
        │
        ▼
   [5] XML Generation (raw → article → manifest → reviews → transfer)
        │
        ▼
   [6] Manifest / File Cross-Reference Resolution
        │
        ▼
   [7] Package Validation (structural, DTD, cross-file)
        │
        ▼
   [8] MECA Packaging (atomic assembly)
        │
        ▼
   [9] Output (publish to operational S3 location)
        │
        ▼
   [10] Logging (structured, per-article, per-stage)
        │
        ▼
   [11] Reporting (run-level + per-article summaries)
        │
        ▼
   [12] Archive (immutable long-term copy)
```

This is the **per-article** pipeline. At batch scale, stages 2–9 run concurrently across N articles simultaneously (per ADR-021), while the Checkpoint Store (crossing all stages) and DOI Registry (crossing stage 5's Article XML Generator) provide the shared coordination points that keep concurrent articles from interfering with each other.

---

## Stage-by-Stage Detail

### [1] Amazon S3 → Working Folder / Staging
**What happens:** The Orchestrator determines the set of articles to process for this run (a defined S3 prefix, or an explicit manifest of article keys). For each article, the Input Reader downloads/stages the root Kriyadocs XML and all round folders to local/ephemeral storage (per the staging strategy chosen in ADR-020).
**Data at this point:** Raw bytes only — no parsing yet.
**Checkpoint:** Article marked `IN_PROGRESS: staging` in the Checkpoint Store.
**Failure paths:** S3 object missing → permanent failure (BR/TC-171). S3 throttled/network blip → transient, retried by the Retry Manager (TC-172). Truncated/corrupted download → detected via size/checksum check, treated as transient (retry download) unless it recurs, then escalated (TC-175).

### [2] Metadata Loading
**What happens:** The Metadata Extractor parses the staged root XML into the internal article model: journal-meta, article-meta, contrib-group, permissions, funding, kwd, counts, history, body, and the fully classified custom-meta-group (file-entries / form-answers / reviewer-scorecards / decision-drafts / decline-reasons).
**Data at this point:** One populated internal article model object.
**Checkpoint:** `IN_PROGRESS: metadata-loaded`.
**Failure paths:** Malformed/unparseable XML → permanent failure, specific parse-error location logged (TC-007–010, TC-044). Missing `custom-meta-group` entirely → permanent failure (BR-007).

### [3] Pre-Transformation Validation
**What happens:** Before any output is generated, the engine validates that the loaded model has everything required to proceed: a resolvable DOI-id field (BR-058), at least one manuscript-category file reference (BR-157), a resolvable round structure (BR-141), and that every custom-meta file-entry resolves to a physical file staged in step 1 (via the File Resolver).
**Data at this point:** Internal article model + resolved file list.
**Checkpoint:** `IN_PROGRESS: pre-validated`.
**Failure paths:** Missing DOI field → permanent failure (TC-049/050). Unresolvable file reference → permanent failure (TC-037). Unreferenced physical file → **not** a failure, logged as a warning and excluded (BR-011, ADR-016) — this is the one "failure path" in this stage that does not stop the article.

### [4] Transformation (Internal Model Build)
**What happens:** The Transformation Engine coordinates preparation of everything the 5 generators need: round-ordering resolution (via `vocab-identifier`, BR-010), custom-meta grouping by round and category, and confidential/non-confidential comment splitting for later use by the Review Generator. This stage produces no output files yet — it finalizes the shared internal model all 5 generators will read from.
**Data at this point:** Fully-prepared internal model, ready for generation.
**Checkpoint:** `IN_PROGRESS: transformed`.
**Failure paths:** Ambiguous round-ordering (e.g. conflicting/missing `vocab-identifier` data) → flagged per ADR-013's confirmed handling.

### [5] XML Generation
**What happens:** The 5 generators run, in dependency order:
1. **Raw XML Generator** — full JATS-Publishing-DTD reformat, nothing pruned.
2. **Article XML Generator** — derived from raw.xml's model: DOI generated (checked against the **DOI Registry Service** — this is a cross-article coordination point, not purely per-article), license synthesized, custom-meta pruned.
3. **Manifest Generator**, **Review Generator**, **Transfer Generator** — these three can run concurrently once the internal model is finalized, since none depends on the others' output.
**Data at this point:** 5 in-memory generated XML documents.
**Checkpoint:** `IN_PROGRESS: generated`.
**Failure paths:** DOI collision detected by the DOI Registry Service → permanent failure requiring manual review (this is the one point in the whole pipeline where one article's outcome can depend on another article's prior DOI, so it's called out specifically). License-type unmapped → permanent failure (ADR-002). Article-type unmapped and no default configured → permanent failure (ADR-001).

### [6] Manifest / File Cross-Reference Resolution
**What happens:** A dedicated consistency pass confirms every manifest item's `xlink:href` resolves to a file the File Resolver actually has bytes for, and every resolved file has exactly one corresponding manifest item (BR-089, BR-153) — this is checked here, before packaging, rather than after, so a mismatch never reaches the Package Builder.
**Data at this point:** Cross-checked (manifest items ↔ resolved files) pairing, confirmed 1:1.
**Checkpoint:** `IN_PROGRESS: cross-referenced`.
**Failure paths:** Any mismatch → permanent failure, specific missing/orphaned filename logged.

### [7] Package Validation
**What happens:** The Validation Engine runs the full Business Rule Book validation suite against the 5 generated documents and the resolved file list: XML well-formedness, DTD conformance (per ADR-025's confirmed scope), namespace-usage correctness, cross-file date consistency, and every other rule in `01_BUSINESS_RULE_BOOK.md`, tiered by severity per ADR-024.
**Data at this point:** A validation report (pass/fail per rule, by severity tier).
**Checkpoint:** `IN_PROGRESS: validated`.
**Failure paths:** Any Critical/High-severity failure → permanent failure, article blocked from packaging, full validation report attached to the failure record. Medium/Low failures → logged as warnings, processing continues.

### [8] MECA Packaging
**What happens:** The Package Builder assembles the `files/<Round>/...` tree and the 5 XML files into `MECA_<ArticleID>.zip`, in a staged (not-yet-published) location. Nothing is published until every component — all 5 XMLs, all resolved physical files, all validation checks — has succeeded (atomicity per ADR-017).
**Data at this point:** A complete, staged zip archive.
**Checkpoint:** `IN_PROGRESS: packaged`.
**Failure paths:** Disk-space exhaustion, filename collision, or any I/O error during assembly → transient (if infrastructure-related) or permanent (if a genuine data collision, e.g. TC-047/TC-179) failure; no partial zip is ever left in the published location either way.

### [9] Output
**What happens:** The Output Writer publishes the staged package to the operational S3 output location (per ADR-029), verifying post-write integrity via checksum comparison.
**Data at this point:** Published package at the operational location.
**Checkpoint:** `COMPLETE: published-operational`.
**Failure paths:** Write failure or post-write checksum mismatch → transient, retried at this stage only (not from the beginning — this is the fine-grained checkpoint granularity referenced in ADR-022/TC-158/TC-173).

### [10] Logging
**What happens:** Every stage above emits structured log events throughout (not only at the end) via the Logging Framework — this box in the diagram represents the aggregation point where the full per-article log trail becomes queryable, not a separate sequential step. `articleId`, `stage`, `ruleId`, `severity`, `message`, `timestamp` are captured per ADR-026.
**Data at this point:** Complete structured log trail for the article.
**Feeds into:** Monitoring (near-real-time) and Reporting Engine (aggregated).

### [11] Reporting
**What happens:** The Reporting Engine aggregates the Logging Framework's events and the Checkpoint Store's final states across the whole batch into a run-level summary report (counts by outcome, by error category, by journal) and per-article detail reports for anything that failed or warned.
**Data at this point:** Human-readable reports, generated once per run (and incrementally queryable during a long-running batch).
**Consumers:** Operators, via Monitoring dashboards and the final run report.

### [12] Archive
**What happens:** Independent of the operational output in stage 9, the Output Writer (or a downstream archival process) also writes an immutable, long-retention copy of the completed package for audit/dispute-resolution purposes (ADR-029).
**Data at this point:** Immutable archival copy, write-once.
**Checkpoint:** `COMPLETE: archived` — this is the true terminal state for an article; `COMPLETE: published-operational` alone (stage 9) is not sufficient to consider the article fully done if archival is part of the confirmed scope.

---

## Cross-Cutting Concerns Not Shown as Discrete Boxes

- **Checkpoint Store**: consulted/updated at every stage transition above, enabling restart-without-reprocessing (ADR-022) at the granularity shown (`staging` → `metadata-loaded` → `pre-validated` → `transformed` → `generated` → `cross-referenced` → `validated` → `packaged` → `published-operational` → `archived`).
- **Retry Manager**: wraps every stage's externally-fallible operations (any S3 call, the DOI Registry check, the Checkpoint Store itself) with the confirmed transient/permanent classification and backoff policy (ADR-023).
- **Configuration Manager**: consulted at stages 2 (classification rules), 5 (all lookup tables), 7 (severity thresholds), and 9/12 (output/archival locations) — loaded once per run, not re-read per article.
- **Monitoring**: observes Checkpoint Store state and the Logging Framework stream continuously throughout the whole flow, independent of any single article's progress.

---

## Batch-Scale View

At 6,000–10,000+ articles per run, the diagram above is instantiated once per article, with stages 2 through 9 running fully in parallel across the configured worker pool (ADR-021). The only points of cross-article coordination are:

1. **DOI Registry Service** (stage 5) — must serialize/synchronize concurrent DOI reservations correctly (no two articles may reserve colliding DOIs).
2. **Checkpoint Store** (all stages) — must support concurrent, atomic per-article state updates (no double-dispatch of the same article to two workers).
3. **Configuration Manager** (loaded once, read-only thereafter) — no write contention, safe to share across all workers.

Every other module and stage operates on strictly one article's data at a time, with no shared mutable state — this is what makes the "per-article parallelism" model in ADR-021 both simple and safe.
