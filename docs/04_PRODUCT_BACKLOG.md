# Product Backlog — MECA Package Generation Engine

Baseline: `01_BUSINESS_RULE_BOOK.md`, `02_ARCHITECTURE_DECISION_RECORDS.md`, `03_TEST_SPECIFICATION.md`. Sprint numbers are indicative (2-week sprints), aligned to the phases in `08_IMPLEMENTATION_ROADMAP.md`. Complexity: **S** (≤2 days) · **M** (3–5 days) · **L** (1–2 weeks) · **XL** (>2 weeks, should be split further before sprint planning).

---

## EPIC 1 — Input Processing

### Feature 1.1: Read Source Package
**Story 1.1.1** — As the conversion engine, I can load an article's Kriyadocs XML and round folders from S3, so that transformation can begin.
- Acceptance Criteria: Given an S3 prefix for one article, the engine downloads/stages the root XML and all round folders; fails cleanly with a specific error if the root XML is missing or duplicated (BR-001).
- Dependencies: ADR-019 (S3 model), ADR-020 (staging strategy) resolved.
- Complexity: M. Priority: Critical. Sprint: 1.

**Story 1.1.2** — As the conversion engine, I can identify all round folders present for an article, so that per-round file processing can proceed.
- Acceptance Criteria: All round subfolders enumerated (BR-002); round-naming is generic (ADR-014), not hard-coded to `Original`/`R1`.
- Dependencies: 1.1.1.
- Complexity: S. Priority: Critical. Sprint: 1.

### Feature 1.2: Parse Kriyadocs XML
**Story 1.2.1** — As the conversion engine, I can parse the Kriyadocs XML into a typed internal model, so that all 5 generators can consume consistent structured data.
- Acceptance Criteria: Journal-meta, article-meta, contrib-group, permissions, funding, kwd, counts, history, body, and custom-meta-group all parsed into typed model objects (BR-007); parser tolerates unknown non-JATS elements without failing (BR-005).
- Dependencies: 1.1.1.
- Complexity: L. Priority: Critical. Sprint: 1–2.

**Story 1.2.2** — As the conversion engine, I can classify every custom-meta entry into one of {file-entry, form-answer, reviewer-scorecard, decision-draft, decline-reason}, so that downstream generators can filter/select correctly.
- Acceptance Criteria: `QN_*` prefix-matched to scorecard (BR-075); file entries identified by `specific-use="form-files"`; all other keys classified as form-answers by default.
- Dependencies: 1.2.1.
- Complexity: M. Priority: Critical. Sprint: 2.

**Story 1.2.3** — As the conversion engine, I can extract round-ordering information from `article-version/@vocab-identifier`, so that "latest round" is resolved reliably.
- Acceptance Criteria: Leading integer `N` extracted and used for sort order, not folder-name string comparison (BR-010, ADR-013).
- Dependencies: 1.2.1.
- Complexity: M. Priority: High. Sprint: 2.

### Feature 1.3: Resolve File References
**Story 1.3.1** — As the conversion engine, I can resolve each file-entry custom-meta record to a physical file in the staged round folder, so that only real submission files are packaged.
- Acceptance Criteria: Resolution tolerant of leading-slash and staging-path-vs-direct-path variance (BR-016, BR-017); unresolvable reference is a hard per-article failure (BR-011); unreferenced physical files logged at WARN (ADR-016).
- Dependencies: 1.1.2, 1.2.2.
- Complexity: M. Priority: Critical. Sprint: 2.

---

## EPIC 2 — Configuration Management

### Feature 2.1: Journal/Publisher Configuration
**Story 2.1.1** — As an operator, I can define per-journal configuration (DOI prefix, source/destination provider names, journal acronym, article-type mapping table), so that a new journal can be onboarded without a code change.
- Acceptance Criteria: Config schema covers every "constant" identified in the Business Rule Book (BR-004, BR-059, BR-128, BR-134); missing config for an encountered journal-id fails cleanly (TC-185).
- Dependencies: ADR-018, ADR-027, ADR-028 resolved.
- Complexity: L. Priority: Critical. Sprint: 1.

**Story 2.1.2** — As an operator, I can update the media-type extension-lookup table without redeploying, so that new file types are supported quickly.
- Acceptance Criteria: Hot-reloadable config; unmapped extension falls back per ADR-009's confirmed policy.
- Dependencies: 2.1.1.
- Complexity: M. Priority: High. Sprint: 2.

**Story 2.1.3** — As an operator, I can update the license-type → license-text mapping table, so that non-CC-BY articles are handled correctly once ADR-002 is confirmed.
- Acceptance Criteria: Table covers every License Type value Portland Press uses; unmapped value fails the article cleanly rather than fabricating text.
- Dependencies: ADR-002 resolved.
- Complexity: M. Priority: Critical. Sprint: 3.

### Feature 2.2: Runtime Configuration Loading
**Story 2.2.1** — As the conversion engine, I load configuration once per run and cache it, so that per-article performance isn't degraded by repeated config reads.
- Acceptance Criteria: Config loaded at run start; hot-reload supported between runs without full redeploy (TC-159, TC-186).
- Dependencies: 2.1.1.
- Complexity: M. Priority: High. Sprint: 2.

---

## EPIC 3 — Transformation Engine: `raw.xml` Generator

### Feature 3.1: raw.xml Structural Generation
**Story 3.1.1** — As the conversion engine, I can produce a JATS-Publishing-DTD-conformant raw.xml from the internal model, so that the full internal metadata record is preserved.
- Acceptance Criteria: DOCTYPE/namespace/encoding exactly per BR-036–039; all source ids retained; pretty-printed output (BR-044).
- Dependencies: 1.2.1.
- Complexity: L. Priority: Critical. Sprint: 3.

**Story 3.1.2** — As the conversion engine, I strip internal workflow/log tags while assembling raw.xml, so that only JATS-legitimate content remains.
- Acceptance Criteria: `workflow`/`stage`/`time-log`/`log`/`mail-*`/`assigned`/`user`/`useremail`/styling wrappers all absent from output (BR-041).
- Dependencies: 3.1.1.
- Complexity: M. Priority: Critical. Sprint: 3.

**Story 3.1.3** — As the conversion engine, I retain 100% of custom-meta-group content in raw.xml, so that raw.xml remains the complete historical record.
- Acceptance Criteria: Every custom-meta entry from every round present, zero pruning (BR-042).
- Dependencies: 3.1.1.
- Complexity: S. Priority: Critical. Sprint: 3.

---

## EPIC 4 — Transformation Engine: `article.xml` Generator

### Feature 4.1: article.xml Structural Generation
**Story 4.1.1** — As the conversion engine, I can produce a JATS-Archiving-DTD-conformant article.xml derived from the raw.xml model, so that a clean public record exists.
- Acceptance Criteria: DOCTYPE/namespace/encoding per BR-052–056; all ids stripped (BR-054); `xmlns:xlink` present if and only if used (BR-056, TC-021/022/027).
- Dependencies: 3.1.1.
- Complexity: L. Priority: Critical. Sprint: 4.

**Story 4.1.2** — As the conversion engine, I set `article-type` via the configured lookup table (ADR-001), so that future article types are supported without a code change.
- Acceptance Criteria: Known types map correctly; unmapped types use the documented default and log a warning.
- Dependencies: 4.1.1, ADR-001 resolved.
- Complexity: M. Priority: High. Sprint: 4.

### Feature 4.2: DOI Generation
**Story 4.2.1** — As the conversion engine, I generate the article's DOI from the doi-article-id field, so that every article has a real, resolvable identifier.
- Acceptance Criteria: Formula matches BR-058 exactly (dash/underscore stripped, case preserved); DOI prefix sourced from config (BR-059, TC-053–058).
- Dependencies: 4.1.1, 2.1.1.
- Complexity: S. Priority: Critical. Sprint: 4.

**Story 4.2.2** — As the conversion engine, I check the generated DOI against a persistent per-journal registry before finalizing the package, so that duplicate DOIs are never produced.
- Acceptance Criteria: Registry lookup/insert is atomic under concurrent access (TC-051, TC-052, TC-167); duplicate detection blocks publication of the offending article(s).
- Dependencies: 4.2.1, ADR-015 resolved.
- Complexity: L. Priority: Critical. Sprint: 5.

### Feature 4.3: License Synthesis
**Story 4.3.1** — As the conversion engine, I synthesize a `<license>` block from the License Type custom-meta value, so that article.xml carries a machine-readable rights statement.
- Acceptance Criteria: CC-BY case matches BR-063/064 exactly; non-CC-BY cases use the config table from Story 2.1.3; unmapped License Type fails cleanly.
- Dependencies: 4.1.1, ADR-002 resolved, 2.1.3.
- Complexity: M. Priority: Critical. Sprint: 4.

### Feature 4.4: Custom-Meta Pruning
**Story 4.4.1** — As the conversion engine, I apply the deny-list pruning rule to custom-meta when building article.xml, so that internal/superseded content is excluded while all other business data passes through.
- Acceptance Criteria: `QN_*`, decline-reasons, decision-draft text, and superseded-round file entries excluded; every other key (including package-unique ones) retained (BR-066–071, TC-136).
- Dependencies: 4.1.1, 1.2.2, 1.2.3.
- Complexity: L. Priority: Critical. Sprint: 4.

---

## EPIC 5 — Transformation Engine: `manifest.xml` Generator

### Feature 5.1: Manifest Structural Generation
**Story 5.1.1** — As the conversion engine, I produce the 3 fixed metadata items in manifest.xml, so that article/reviews/transfer are always discoverable.
- Acceptance Criteria: Fixed order, fixed descriptions, correct `publisher-id` interpolation (BR-077–080, TC-105).
- Dependencies: 1.2.1.
- Complexity: S. Priority: Critical. Sprint: 5.

**Story 5.1.2** — As the conversion engine, I produce one manifest item per resolved file, correctly typed via the item-type lookup table, so that every submitted file is discoverable and correctly categorized.
- Acceptance Criteria: Lookup table matches BR-078 exactly, with documented fallback for unmapped categories (BR-019, TC-107/108).
- Dependencies: 1.3.1, 5.1.1.
- Complexity: M. Priority: Critical. Sprint: 5.

**Story 5.1.3** — As the conversion engine, I order manifest items latest-round-first, so that output matches the confirmed sample pattern.
- Acceptance Criteria: Ordering matches BR-083 (TC-109).
- Dependencies: 1.2.3, 5.1.2.
- Complexity: S. Priority: High. Sprint: 5.

**Story 5.1.4** — As the conversion engine, I generate clean, deterministic `item/@id` values and `item-description` text, so that the manifest never reproduces the known sample defects.
- Acceptance Criteria: Matches the schemes chosen in ADR-010/ADR-011 exactly (TC-111, TC-112).
- Dependencies: 5.1.2, ADR-010/011 resolved.
- Complexity: S. Priority: Medium. Sprint: 5.

---

## EPIC 6 — Transformation Engine: `reviews.xml` Generator

### Feature 6.1: Reviewer Activity Reconstruction
**Story 6.1.1** — As the conversion engine, I emit one `<review review-type="review">` block per (reviewer × round), correctly attributed and dated, so that the full peer-review history is captured.
- Acceptance Criteria: Canonical attribute schema always present (BR-098); `review-type` never emits an illegal literal (BR-099, TC-091); dates present per BR-114 (TC-096).
- Dependencies: 1.2.1, 1.2.2.
- Complexity: XL — split into 6.1.1a (completed reviews), 6.1.1b (declined/terminated), 6.1.1c (file-attachment reviews) before sprint planning.
- Priority: Critical. Sprint: 6–7.

**Story 6.1.1a** — Completed reviews: recommendation + author/editor-split comments.
- Acceptance Criteria: Matches BR-103–105 (TC-083, TC-093).
- Complexity: M. Priority: Critical. Sprint: 6.

**Story 6.1.1b** — Declined/terminated reviewers: status-only, no fabricated content.
- Acceptance Criteria: Matches BR-106–107, BR-125 (TC-084, TC-085).
- Complexity: S. Priority: Critical. Sprint: 6.

**Story 6.1.1c** — Reviews submitted as file attachments.
- Acceptance Criteria: Matches BR-108 and the Silverchair-confirmed answer from ADR-003 (TC-086).
- Complexity: M. Priority: Critical. Sprint: 7.

### Feature 6.2: Editorial Decisions
**Story 6.2.1** — As the conversion engine, I emit one `<review review-type="decision">` block per round's editorial decision, so that the acceptance/revision history is captured.
- Acceptance Criteria: Matches BR-109–110 (TC-087).
- Dependencies: 6.1.1.
- Complexity: M. Priority: Critical. Sprint: 7.

**Story 6.2.2** — As the conversion engine, I split a combined multi-point editor screening message into individual review-items, so that each checklist point is independently discoverable.
- Acceptance Criteria: Matches BR-111 (TC-088).
- Dependencies: 6.2.1.
- Complexity: M. Priority: High. Sprint: 7.

### Feature 6.3: Correspondence & Extended History (scope per ADR-005)
**Story 6.3.1** — As the conversion engine, I can optionally include duplicate correspondence-log entries alongside formal reviews, controlled by configuration, so that the audit-trail depth matches business preference (ADR-004).
- Acceptance Criteria: Config flag toggles inclusion; both modes tested (TC-094).
- Dependencies: 6.1.1, ADR-004 resolved.
- Complexity: M. Priority: Medium. Sprint: 8.

**Story 6.3.2** — As the conversion engine, I can optionally extract author-suggested reviewers, editor-reassignment history, and post-acceptance copyediting queries, controlled by configuration, so that the pkg1-level depth is available where wanted (ADR-005).
- Acceptance Criteria: Config flag toggles inclusion; both modes tested (TC-095).
- Dependencies: 6.1.1, ADR-005 resolved.
- Complexity: L. Priority: Medium. Sprint: 8.

---

## EPIC 7 — Transformation Engine: `transfer.xml` Generator

### Feature 7.1: Transfer Metadata Generation
**Story 7.1.1** — As the conversion engine, I generate transfer.xml from config constants plus the corresponding-author email, so that source/destination handshake metadata is correct.
- Acceptance Criteria: Provider names, acronym, authentication-code, processing-instructions all match BR-128–138, using the ADR-007-confirmed acronym value (TC-123–128).
- Dependencies: 2.1.1, 1.2.1, ADR-007 resolved.
- Complexity: M. Priority: Critical. Sprint: 6.

**Story 7.1.2** — As the conversion engine, I deterministically select the primary corresponding-author email when multiple exist, so that transfer.xml always has one correct contact.
- Acceptance Criteria: Matches BR-130's confirmed selection rule (TC-080, TC-129).
- Dependencies: 7.1.1.
- Complexity: S. Priority: High. Sprint: 6.

---

## EPIC 8 — Validation Engine

### Feature 8.1: Structural & DTD Validation
**Story 8.1.1** — As the conversion engine, I validate every generated XML for well-formedness before packaging, so that malformed output never ships.
- Acceptance Criteria: 100% of TC-001–010 pass.
- Dependencies: All generator epics (3–7).
- Complexity: M. Priority: Critical. Sprint: 9.

**Story 8.1.2** — As the conversion engine, I validate manifest/reviews/transfer against their real vendored DTDs, so that MECA structural conformance is guaranteed.
- Acceptance Criteria: 100% of TC-016–018 pass; ADR-025 decision implemented.
- Dependencies: 8.1.1, ADR-025 resolved.
- Complexity: L. Priority: Critical. Sprint: 9.

**Story 8.1.3** — As the conversion engine, I validate every namespace-prefix usage has a matching declaration in scope, so that the pkg3-style defect never recurs.
- Acceptance Criteria: 100% of TC-021–028 pass.
- Dependencies: 8.1.1.
- Complexity: M. Priority: Critical. Sprint: 9.

### Feature 8.2: Cross-File & Package-Level Validation
**Story 8.2.1** — As the conversion engine, I validate that every `files/` entry has exactly one manifest item and vice versa, so that the package is internally consistent.
- Acceptance Criteria: 100% of TC-061, TC-062, TC-106 pass.
- Dependencies: 5.1.2.
- Complexity: M. Priority: Critical. Sprint: 9.

**Story 8.2.2** — As the conversion engine, I validate date consistency across history/reviews/decisions, so that chronologically impossible data is flagged.
- Acceptance Criteria: 100% of TC-063, TC-096, BR-155/156 pass.
- Dependencies: 6.1.1, 6.2.1.
- Complexity: M. Priority: High. Sprint: 10.

### Feature 8.3: Severity-Tiered Validation Policy
**Story 8.3.1** — As the conversion engine, I classify every validation failure by severity (Critical/High/Medium/Low) and only block packaging on Critical/High failures, so that cosmetic issues don't block valid articles.
- Acceptance Criteria: Matches ADR-024's confirmed policy; every rule in the Business Rule Book correctly tagged and enforced at its stated priority.
- Dependencies: 8.1.*, 8.2.*, ADR-024 resolved.
- Complexity: L. Priority: Critical. Sprint: 10.

---

## EPIC 9 — Packaging & Output

### Feature 9.1: Package Assembly
**Story 9.1.1** — As the conversion engine, I assemble the 5 XML files and `files/` tree into a single zip named `MECA_<ArticleID>.zip`, so that the final deliverable matches the confirmed structure.
- Acceptance Criteria: 100% of TC-115–117, TC-122 pass.
- Dependencies: Epics 3–7 complete for one article.
- Complexity: M. Priority: Critical. Sprint: 6.

**Story 9.1.2** — As the conversion engine, I stage all outputs and only publish the complete package atomically on full success, so that no partial/incomplete package is ever visible downstream.
- Acceptance Criteria: 100% of TC-118 passes; matches ADR-017.
- Dependencies: 9.1.1, ADR-017 resolved.
- Complexity: L. Priority: Critical. Sprint: 11.

### Feature 9.2: Output Storage & Archival
**Story 9.2.1** — As the conversion engine, I write the completed package to the operational S3 output location and a separate immutable archival location, so that both operational handoff and long-term audit needs are met.
- Acceptance Criteria: Matches ADR-029; TC-153 passes.
- Dependencies: 9.1.2, ADR-029 resolved.
- Complexity: M. Priority: High. Sprint: 11.

---

## EPIC 10 — Error Handling, Retry & Recovery

### Feature 10.1: Error Classification
**Story 10.1.1** — As the conversion engine, I classify every failure as transient (retryable) or permanent (not retryable), so that retry effort isn't wasted on unfixable data problems.
- Acceptance Criteria: Matches ADR-023's taxonomy; TC-160, TC-161 pass.
- Dependencies: All ingestion/generation epics.
- Complexity: M. Priority: Critical. Sprint: 8.

### Feature 10.2: Retry Manager
**Story 10.2.1** — As the conversion engine, I automatically retry transient failures with exponential backoff up to a configured maximum, so that infrastructure blips don't cause unnecessary article failures.
- Acceptance Criteria: 100% of TC-160–165 pass.
- Dependencies: 10.1.1, ADR-023 resolved.
- Complexity: L. Priority: Critical. Sprint: 8.

### Feature 10.3: Checkpointing & Restart
**Story 10.3.1** — As the conversion engine, I record a per-article checkpoint (not-started/in-progress/complete/failed) in a durable store, so that a batch can resume without reprocessing completed articles.
- Acceptance Criteria: 100% of TC-154–159 pass.
- Dependencies: 9.1.2, ADR-022 resolved.
- Complexity: L. Priority: Critical. Sprint: 9.

### Feature 10.4: Failure Isolation
**Story 10.4.1** — As the conversion engine, I ensure one article's failure never blocks or crashes processing of other articles in the same batch, so that batch throughput is resilient to individual bad inputs.
- Acceptance Criteria: 100% of TC-149, TC-168 pass.
- Dependencies: 10.1.1.
- Complexity: M. Priority: Critical. Sprint: 8.

---

## EPIC 11 — Logging, Monitoring & Reporting

### Feature 11.1: Structured Logging
**Story 11.1.1** — As an operator, I can see structured, per-article, per-rule-referenced log lines for every significant event, so that I can troubleshoot any specific article quickly.
- Acceptance Criteria: Matches ADR-026's confirmed schema; every WARN/ERROR references the relevant BR-xxx rule id where applicable.
- Dependencies: All processing epics.
- Complexity: M. Priority: High. Sprint: 3 (introduced early, extended throughout).

### Feature 11.2: Batch Reporting
**Story 11.2.1** — As an operator, I receive a human-readable per-run summary report (success/failure/warning counts, categorized by error type and journal), so that I can assess run health at a glance.
- Acceptance Criteria: Matches TC-150; totals reconcile exactly against actual outcomes.
- Dependencies: 11.1.1.
- Complexity: M. Priority: High. Sprint: 10.

### Feature 11.3: Monitoring & Alerting
**Story 11.3.1** — As an operator, I receive an alert when batch failure rate exceeds a configured threshold, so that I can intervene before a run silently degrades.
- Acceptance Criteria: Matches ADR-030's confirmed thresholds.
- Dependencies: 11.2.1, ADR-030 resolved.
- Complexity: M. Priority: High. Sprint: 11.

**Story 11.3.2** — As an operator, I have a per-article-level dashboard showing status, retry count, and failure category, so that I can drill into any stuck or failed article.
- Acceptance Criteria: Dashboard reflects checkpoint-store state in near-real-time.
- Dependencies: 10.3.1, 11.3.1.
- Complexity: L. Priority: Medium. Sprint: 12.

---

## EPIC 12 — Multi-Round Processing

### Feature 12.1: Round-Aware Generation
**Story 12.1.1** — As the conversion engine, I correctly generalize "latest round wins" (article.xml) and "all rounds listed" (manifest.xml) rules to N rounds (not just 2), so that articles with 0, 1, or 3+ rounds process correctly.
- Acceptance Criteria: 100% of TC-130–137 pass, including the synthetic 3-round and 10-round fixtures.
- Dependencies: 4.4.1, 5.1.3, ADR-013 resolved.
- Complexity: L. Priority: Critical. Sprint: 5.

---

## EPIC 13 — Performance, Memory & Scale

### Feature 13.1: Single-Article Performance
**Story 13.1.1** — As an operator, I need single-article processing to complete within an agreed SLA, so that batch throughput targets are achievable.
- Acceptance Criteria: 100% of TC-138–140 pass against the confirmed SLA.
- Dependencies: All generator/validation epics complete.
- Complexity: M. Priority: High. Sprint: 12.

### Feature 13.2: Batch-Scale Performance
**Story 13.2.1** — As an operator, I need a 6,000–10,000-article batch to complete within an agreed wall-clock target using parallel workers, so that production SLAs are met.
- Acceptance Criteria: 100% of TC-141–143, TC-148, TC-151 pass.
- Dependencies: 13.1.1, ADR-021 (concurrency model).
- Complexity: XL — split into infra provisioning, worker-pool implementation, and load-test sub-tasks before sprint planning.
- Priority: Critical. Sprint: 12–13.

### Feature 13.3: Memory Safety
**Story 13.3.1** — As the conversion engine, I stay within per-worker memory budgets even for large attachments and long-running batches, so that OOM crashes never interrupt a production run.
- Acceptance Criteria: 100% of TC-144–147 pass.
- Dependencies: 1.1.1 (staging strategy), 13.2.1.
- Complexity: L. Priority: Critical. Sprint: 13.

---

## EPIC 14 — Multi-Tenancy / Multi-Journal Support

### Feature 14.1: Second-Journal Onboarding Path
**Story 14.1.1** — As an operator, I can onboard a second journal/publisher purely via configuration, so that no code change is required for a new journal.
- Acceptance Criteria: 100% of TC-184–187 pass using a synthetic second-journal fixture.
- Dependencies: Epic 2 complete, ADR-028 confirmed.
- Complexity: L. Priority: Medium (High if multi-journal is confirmed on roadmap; can be deprioritized if ADR-028 resolves to "not needed"). Sprint: 13.

---

## EPIC 15 — QA & Acceptance Baselines

### Feature 15.1: Sample-Package Regression Baseline
**Story 15.1.1** — As a QA engineer, I can run the converter against the 3 original sample article inputs and diff the output against the known manually-built packages (in strict-replication mode per ADR-031), so that every intentional deviation is documented and every unintentional one is caught.
- Acceptance Criteria: 100% of TC-120 passes; diff report reviewed and signed off once as the permanent regression baseline.
- Dependencies: All generator epics, ADR-031 resolved.
- Complexity: M. Priority: Critical. Sprint: 9.

### Feature 15.2: Synthetic Fixture Library
**Story 15.2.1** — As a QA engineer, I have a maintained library of synthetic test fixtures covering every scenario the 3 real samples don't (3+ rounds, missing DOI, malformed XML, non-CC-BY license, second journal, etc.), so that test coverage isn't limited by real-sample scarcity.
- Acceptance Criteria: One fixture per "Requires Business Confirmation" rule in the Business Rule Book that has a testable edge case.
- Dependencies: Business Rule Book finalized.
- Complexity: L. Priority: Critical. Sprint: 5 (started early, grows throughout).

---

## Backlog Summary

| Epic | Features | Stories (incl. sub-stories) | Overall Priority |
|---|---|---|---|
| 1. Input Processing | 3 | 6 | Critical |
| 2. Configuration Management | 2 | 4 | Critical |
| 3. raw.xml Generator | 1 | 3 | Critical |
| 4. article.xml Generator | 4 | 6 | Critical |
| 5. manifest.xml Generator | 1 | 4 | Critical |
| 6. reviews.xml Generator | 3 | 7 | Critical |
| 7. transfer.xml Generator | 1 | 2 | Critical |
| 8. Validation Engine | 3 | 6 | Critical |
| 9. Packaging & Output | 2 | 3 | Critical |
| 10. Error Handling/Retry/Recovery | 4 | 4 | Critical |
| 11. Logging/Monitoring/Reporting | 3 | 4 | High |
| 12. Multi-Round Processing | 1 | 1 | Critical |
| 13. Performance/Memory/Scale | 3 | 3 | Critical |
| 14. Multi-Tenancy | 1 | 1 | Medium–High |
| 15. QA & Acceptance Baselines | 2 | 2 | Critical |
| **Total** | **34** | **~56 stories (~65 incl. sub-stories)** | |

Indicative sprint range: **Sprint 1 through Sprint 13** (≈26 weeks / 6 months for full backlog at typical enterprise velocity) — see `08_IMPLEMENTATION_ROADMAP.md` for phase-level grouping and complexity rationale.
